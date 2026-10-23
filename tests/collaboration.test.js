'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config/env');
const { api, registerUser, createTeamWithMembers } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

describe('Comments & attachments', () => {
  let owner;
  let alice;
  let outsider;
  let task;

  beforeEach(async () => {
    owner = await registerUser({ name: 'Owner' });
    alice = await registerUser({ name: 'Alice' });
    outsider = await registerUser({ name: 'Outsider' });
    const team = await createTeamWithMembers(owner, [alice]);
    const res = await api(owner.token).post('/tasks').send({ title: 'Collaborate', team: team.id });
    task = res.body.data;
  });

  describe('comments', () => {
    it('adds, lists, edits and deletes comments, keeping the counter in sync', async () => {
      const created = await api(alice.token)
        .post(`/tasks/${task.id}/comments`)
        .send({ body: 'First!' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ body: 'First!', editedAt: null });
      expect(created.body.data.author).toMatchObject({ id: alice.user.id, name: 'Alice' });

      await api(owner.token).post(`/tasks/${task.id}/comments`).send({ body: 'Second' });

      const list = await api(owner.token).get(`/tasks/${task.id}/comments?order=asc`);
      expect(list.body.data.map((c) => c.body)).toEqual(['First!', 'Second']);
      expect((await api(owner.token).get(`/tasks/${task.id}`)).body.data.commentCount).toBe(2);

      const commentId = created.body.data.id;
      const edited = await api(alice.token)
        .patch(`/tasks/${task.id}/comments/${commentId}`)
        .send({ body: 'First (edited)' });
      expect(edited.status).toBe(200);
      expect(edited.body.data.editedAt).toEqual(expect.any(String));

      expect(
        (await api(alice.token).delete(`/tasks/${task.id}/comments/${commentId}`)).status,
      ).toBe(204);
      expect((await api(owner.token).get(`/tasks/${task.id}`)).body.data.commentCount).toBe(1);
    });

    it('only lets the author edit, while managers may moderate', async () => {
      const { body } = await api(alice.token)
        .post(`/tasks/${task.id}/comments`)
        .send({ body: 'Mine' });
      const url = `/tasks/${task.id}/comments/${body.data.id}`;

      expect((await api(owner.token).patch(url).send({ body: 'Edited by owner' })).status).toBe(
        403,
      );
      expect((await api(owner.token).delete(url)).status).toBe(204);
    });

    it('hides comments from users without access to the task', async () => {
      expect((await api(outsider.token).get(`/tasks/${task.id}/comments`)).status).toBe(404);
      expect(
        (await api(outsider.token).post(`/tasks/${task.id}/comments`).send({ body: 'hi' })).status,
      ).toBe(404);
    });

    it('validates the comment body', async () => {
      const res = await api(alice.token).post(`/tasks/${task.id}/comments`).send({ body: '   ' });
      expect(res.status).toBe(422);
    });
  });

  describe('attachments', () => {
    const upload = (user, files) => {
      let req = api(user.token).post(`/tasks/${task.id}/attachments`);
      for (const file of files) {
        req = req.attach('files', Buffer.from(file.content), {
          filename: file.name,
          contentType: file.type,
        });
      }
      return req;
    };

    it('uploads, lists, downloads and deletes attachments', async () => {
      const res = await upload(alice, [
        { name: 'notes.txt', type: 'text/plain', content: 'hello world' },
        { name: 'data.csv', type: 'text/csv', content: 'a,b\n1,2' },
      ]);
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].storageKey).toBeUndefined();
      expect(res.body.data.map((a) => a.originalName).sort()).toEqual(['data.csv', 'notes.txt']);

      const list = await api(owner.token).get(`/tasks/${task.id}/attachments`);
      expect(list.body.data).toHaveLength(2);
      expect((await api(owner.token).get(`/tasks/${task.id}`)).body.data.attachmentCount).toBe(2);

      const txt = list.body.data.find((a) => a.originalName === 'notes.txt');
      const download = await api(owner.token)
        .get(`/tasks/${task.id}/attachments/${txt.id}/download`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks = [];
          response.on('data', (c) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(download.status).toBe(200);
      expect(download.headers['content-disposition']).toMatch(
        /^attachment; filename="?notes\.txt"?/,
      );
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.body.toString()).toBe('hello world');

      const del = await api(alice.token).delete(`/tasks/${task.id}/attachments/${txt.id}`);
      expect(del.status).toBe(204);
      expect((await api(owner.token).get(`/tasks/${task.id}`)).body.data.attachmentCount).toBe(1);
    });

    it('rejects disallowed or disguised file types', async () => {
      const html = await upload(alice, [
        { name: 'evil.html', type: 'text/html', content: '<script>alert(1)</script>' },
      ]);
      expect(html.status).toBe(415);

      const disguised = await upload(alice, [
        { name: 'image.png', type: 'text/html', content: '<script>alert(1)</script>' },
      ]);
      expect(disguised.status).toBe(415);
    });

    it('rejects files above the size limit', async () => {
      const big = 'x'.repeat(config.uploads.maxFileSizeBytes + 1);
      const res = await upload(alice, [{ name: 'big.txt', type: 'text/plain', content: big }]);
      expect(res.status).toBe(413);
    });

    it('requires at least one file', async () => {
      const res = await api(alice.token)
        .post(`/tasks/${task.id}/attachments`)
        .field('note', 'nothing attached');
      expect(res.status).toBe(400);
    });

    it('does not store files for users without access', async () => {
      const before = fs.readdirSync(config.uploads.dir).length;
      const res = await upload(outsider, [{ name: 'x.txt', type: 'text/plain', content: 'x' }]);
      expect(res.status).toBe(404);
      expect(fs.readdirSync(config.uploads.dir)).toHaveLength(before);
    });

    it('removes stored files when the task is deleted', async () => {
      const res = await upload(alice, [{ name: 'gone.txt', type: 'text/plain', content: 'bye' }]);
      const before = fs.readdirSync(config.uploads.dir).length;
      expect((await api(owner.token).delete(`/tasks/${task.id}`)).status).toBe(204);
      expect(fs.readdirSync(config.uploads.dir)).toHaveLength(before - 1);
      expect(res.body.data).toHaveLength(1);
      expect(path.isAbsolute(config.uploads.dir)).toBe(true);
    });
  });
});

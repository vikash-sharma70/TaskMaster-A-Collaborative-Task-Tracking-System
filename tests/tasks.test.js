'use strict';

const { api, registerUser, createTeamWithMembers } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

describe('Tasks', () => {
  let owner;
  let alice;
  let outsider;
  let team;

  beforeEach(async () => {
    owner = await registerUser({ name: 'Owner' });
    alice = await registerUser({ name: 'Alice' });
    outsider = await registerUser({ name: 'Outsider' });
    team = await createTeamWithMembers(owner, [alice]);
  });

  const createTask = (user, body) => api(user.token).post('/tasks').send(body);

  describe('POST /tasks', () => {
    it('creates a personal task with defaults', async () => {
      const res = await createTask(owner, {
        title: 'Write README',
        description: 'Document the API',
        dueDate: '2030-01-15',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: 'Write README',
        description: 'Document the API',
        status: 'open',
        priority: 'medium',
        team: null,
        assignee: null,
        commentCount: 0,
        attachmentCount: 0,
      });
      expect(res.body.data.createdBy).toMatchObject({ id: owner.user.id, name: 'Owner' });
      expect(new Date(res.body.data.dueDate).toISOString()).toBe('2030-01-15T00:00:00.000Z');
      expect(res.body.data.priorityRank).toBeUndefined();
    });

    it('creates a team task assigned to a team member', async () => {
      const res = await createTask(owner, {
        title: 'Build API',
        team: team.id,
        assignee: alice.user.id,
        priority: 'high',
        tags: ['Backend', 'api', 'backend'],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.team).toMatchObject({ id: team.id, name: team.name });
      expect(res.body.data.assignee).toMatchObject({ id: alice.user.id });
      expect(res.body.data.tags).toEqual(['backend', 'api']);
    });

    it('refuses to assign to someone outside the team', async () => {
      const res = await createTask(owner, {
        title: 'Nope',
        team: team.id,
        assignee: outsider.user.id,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('only allows self-assignment on personal tasks', async () => {
      const res = await createTask(owner, { title: 'Personal', assignee: alice.user.id });
      expect(res.status).toBe(422);
      const self = await createTask(owner, { title: 'Personal', assignee: owner.user.id });
      expect(self.status).toBe(201);
    });

    it('refuses to create tasks in a team I am not part of', async () => {
      const res = await createTask(outsider, { title: 'Sneaky', team: team.id });
      expect(res.status).toBe(404);
    });

    it('validates the payload', async () => {
      const res = await createTask(owner, { title: '', priority: 'critical', dueDate: 'tomorrow' });
      expect(res.status).toBe(422);
      expect(res.body.error.details.map((d) => d.field)).toEqual(
        expect.arrayContaining(['title', 'priority', 'dueDate']),
      );
    });
  });

  describe('visibility & permissions', () => {
    it('lets team members view team tasks but not outsiders', async () => {
      const { body } = await createTask(owner, { title: 'Team task', team: team.id });
      expect((await api(alice.token).get(`/tasks/${body.data.id}`)).status).toBe(200);
      expect((await api(outsider.token).get(`/tasks/${body.data.id}`)).status).toBe(404);
    });

    it('keeps personal tasks private', async () => {
      const { body } = await createTask(owner, { title: 'Secret' });
      expect((await api(alice.token).get(`/tasks/${body.data.id}`)).status).toBe(404);
    });

    it('exposes my permissions on the task', async () => {
      const { body } = await createTask(owner, { title: 'Perm', team: team.id });
      const res = await api(alice.token).get(`/tasks/${body.data.id}`);
      expect(res.body.data.permissions).toEqual({
        canEdit: false,
        canDelete: false,
        canAssign: false,
      });
    });

    it('forbids plain members from editing tasks they neither created nor own', async () => {
      const { body } = await createTask(owner, { title: 'Not yours', team: team.id });
      const res = await api(alice.token)
        .patch(`/tasks/${body.data.id}`)
        .send({ title: 'Mine now' });
      expect(res.status).toBe(403);
    });

    it('lets the assignee update and complete the task', async () => {
      const { body } = await createTask(owner, {
        title: 'Assigned',
        team: team.id,
        assignee: alice.user.id,
      });
      const res = await api(alice.token)
        .patch(`/tasks/${body.data.id}/status`)
        .send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completedAt).toEqual(expect.any(String));

      const reopened = await api(alice.token)
        .patch(`/tasks/${body.data.id}/status`)
        .send({ status: 'open' });
      expect(reopened.body.data.completedAt).toBeNull();
    });
  });

  describe('assignment', () => {
    it('assigns and unassigns via PATCH /tasks/:id/assignee', async () => {
      const { body } = await createTask(owner, { title: 'Assign me', team: team.id });

      const assigned = await api(owner.token)
        .patch(`/tasks/${body.data.id}/assignee`)
        .send({ assignee: alice.user.id });
      expect(assigned.status).toBe(200);
      expect(assigned.body.data.assignee.id).toBe(alice.user.id);

      const unassigned = await api(owner.token)
        .patch(`/tasks/${body.data.id}/assignee`)
        .send({ assignee: null });
      expect(unassigned.body.data.assignee).toBeNull();
    });

    it('validates the assignee on update', async () => {
      const { body } = await createTask(owner, { title: 'Assign me', team: team.id });
      const res = await api(owner.token)
        .patch(`/tasks/${body.data.id}/assignee`)
        .send({ assignee: outsider.user.id });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /tasks (filter, sort, search, paginate)', () => {
    beforeEach(async () => {
      await createTask(owner, {
        title: 'Fix login bug',
        description: 'Session expires too early',
        team: team.id,
        assignee: alice.user.id,
        priority: 'urgent',
        dueDate: '2020-01-01',
        tags: ['auth'],
      });
      await createTask(owner, {
        title: 'Design dashboard',
        description: 'Charts for weekly metrics',
        team: team.id,
        priority: 'low',
        dueDate: '2031-06-01',
      });
      await createTask(owner, {
        title: 'Write release notes',
        team: team.id,
        assignee: alice.user.id,
        status: 'completed',
        priority: 'medium',
      });
      await createTask(owner, { title: 'Personal errand', priority: 'high' });
      await createTask(outsider, { title: 'Outsider task about login' });
    });

    it('lists all tasks visible to me', async () => {
      const res = await api(owner.token).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(4);
      expect(res.body.data.map((t) => t.title)).not.toContain('Outsider task about login');
    });

    it('lists tasks assigned to me', async () => {
      const viaFilter = await api(alice.token).get('/tasks?assignee=me');
      const viaAlias = await api(alice.token).get('/tasks/assigned-to-me');
      expect(viaFilter.body.meta.total).toBe(2);
      expect(viaAlias.body.data.map((t) => t.id).sort()).toEqual(
        viaFilter.body.data.map((t) => t.id).sort(),
      );
    });

    it('filters by status (single and multiple)', async () => {
      const completed = await api(owner.token).get('/tasks?status=completed');
      expect(completed.body.data.map((t) => t.title)).toEqual(['Write release notes']);

      const openish = await api(owner.token).get('/tasks?status=open,in_progress');
      expect(openish.body.meta.total).toBe(3);
    });

    it('filters by team, priority, tags, unassigned and overdue', async () => {
      expect((await api(owner.token).get(`/tasks?team=${team.id}`)).body.meta.total).toBe(3);
      expect((await api(owner.token).get('/tasks?priority=urgent,high')).body.meta.total).toBe(2);
      expect((await api(owner.token).get('/tasks?tags=auth')).body.data[0].title).toBe(
        'Fix login bug',
      );
      expect(
        (await api(owner.token).get(`/tasks?team=${team.id}&assignee=unassigned`)).body.meta.total,
      ).toBe(1);

      const overdue = await api(owner.token).get('/tasks?overdue=true');
      expect(overdue.body.data.map((t) => t.title)).toEqual(['Fix login bug']);
    });

    it('filters by due-date range', async () => {
      const res = await api(owner.token).get('/tasks?dueAfter=2025-01-01&dueBefore=2032-01-01');
      expect(res.body.data.map((t) => t.title)).toEqual(['Design dashboard']);
    });

    it('searches title and description', async () => {
      const byTitle = await api(owner.token).get('/tasks?search=login');
      expect(byTitle.body.data.map((t) => t.title)).toEqual(['Fix login bug']);

      const byDescription = await api(owner.token).get('/tasks?search=metrics');
      expect(byDescription.body.data.map((t) => t.title)).toEqual(['Design dashboard']);
    });

    it('sorts by priority semantically (not alphabetically)', async () => {
      const res = await api(owner.token).get('/tasks?sort=-priority');
      expect(res.body.data.map((t) => t.priority)).toEqual(['urgent', 'high', 'medium', 'low']);
    });

    it('paginates with metadata', async () => {
      const page1 = await api(owner.token).get('/tasks?limit=3&page=1&sort=title');
      const page2 = await api(owner.token).get('/tasks?limit=3&page=2&sort=title');
      expect(page1.body.data).toHaveLength(3);
      expect(page2.body.data).toHaveLength(1);
      expect(page1.body.meta).toMatchObject({ total: 4, totalPages: 2, hasNextPage: true });
      expect(page2.body.meta).toMatchObject({ hasNextPage: false, hasPrevPage: true });
    });

    it('rejects invalid query parameters', async () => {
      expect((await api(owner.token).get('/tasks?status=done')).status).toBe(422);
      expect((await api(owner.token).get('/tasks?limit=1000')).status).toBe(422);
      expect((await api(owner.token).get('/tasks?sort=relevance')).status).toBe(400);
      expect((await api(owner.token).get('/tasks?unknown=1')).status).toBe(422);
    });

    it('returns dashboard stats', async () => {
      const res = await api(alice.token).get('/tasks/stats');
      expect(res.body.data).toEqual({
        total: 3,
        open: 2,
        inProgress: 0,
        completed: 1,
        assignedToMe: 2,
        assignedToMeOpen: 1,
        overdue: 1,
      });
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('allows the creator or a team manager, not plain members', async () => {
      const { body } = await createTask(alice, { title: 'By Alice', team: team.id });
      const other = await createTask(owner, { title: 'By owner', team: team.id });

      expect((await api(alice.token).delete(`/tasks/${other.body.data.id}`)).status).toBe(403);
      expect((await api(owner.token).delete(`/tasks/${body.data.id}`)).status).toBe(204);
      expect((await api(owner.token).get(`/tasks/${body.data.id}`)).status).toBe(404);
    });
  });
});

'use strict';

const { app, request, api, registerUser, API } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

describe('Platform behaviour', () => {
  it('exposes liveness and readiness probes', async () => {
    expect((await request(app).get('/health')).body.status).toBe('ok');
    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.database).toBe(true);
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/tasks', '/auth/login']));
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get(`${API}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'ROUTE_NOT_FOUND' } });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Malformed JSON body');
  });

  it('propagates or generates a request id', async () => {
    const generated = await request(app).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[\w-]{36}$/);

    const propagated = await request(app).get('/health').set('X-Request-Id', 'trace-123');
    expect(propagated.headers['x-request-id']).toBe('trace-123');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('includes the request id in error bodies', async () => {
    const res = await request(app).get(`${API}/users/me`).set('X-Request-Id', 'req-42');
    expect(res.body.error.requestId).toBe('req-42');
  });

  it('rejects operator-shaped query parameters', async () => {
    const { token } = await registerUser();
    const res = await api(token).get('/tasks?status[$ne]=open');
    expect(res.status).toBe(422);
  });
});

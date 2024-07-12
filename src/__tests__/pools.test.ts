import express, { Express } from 'express';
import request from 'supertest';

import router from '../routes';

describe('GET /pools_list', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  it('GET /sdex/pool_list should return pools data', async () => {
    const response = await request(app).get('/sdex/pool_list').query({ chainId: 60808, limit: 10, cursor: 0 });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});

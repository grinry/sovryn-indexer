import express, { Express } from 'express';
import request from 'supertest';

import router from '../../routes';

describe('routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  it('GET /legacy/cmc/tvl should return TVL data', async () => {
    const response = await request(app).get('/api/legacy/cmc/tvl').query({ chainId: 60808 });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });

  it('GET /legacy/cmc/summary should return SUMMARY data', async () => {
    const response = await request(app).get('/api/legacy/cmc/summary').query({ chainId: 60808 });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});

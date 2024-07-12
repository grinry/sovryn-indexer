import express, { Express } from 'express';
import request from 'supertest';

import router from '../../routes';

describe('routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  it('GET /legacy/cmc/tvl should return TVL data', async () => {
    const response = await request(app).get('/legacy/cmc/tvl').query({ chainId: 60808 });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });

  it('GET /legacy/cmc/summary should return SUMMARY data', async () => {
    const response = await request(app).get('/legacy/cmc/summary').query({ chainId: 60808 });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });

  it('GET /sdex/user_pool_positions should return user pool positions', async () => {
    const mockUserPoolPositions = {
      user: '0x016b52a20a9b06670f28996c226012ff0f604ba9',
      chainId: '60808',
      base: '0x0000000000000000000000000000000000000000',
      quote: '0xba20a5e63eeefffa6fd365e7e540628f8fc61474',
      poolIdx: 410,
    };
    const response = await request(app).get('/sdex/user_pool_positions').query(mockUserPoolPositions);
    expect(response.status).toBe(200);
  });
});

import express, { Express } from 'express';
import request from 'supertest';

import router from '../routes';

describe('GET /chains', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  it('should return chains data', async () => {
    const response = await request(app).get('/api/chains');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});

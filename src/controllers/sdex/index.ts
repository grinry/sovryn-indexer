import { Router } from 'express';

const router = Router();

router.get('/user_pool_positions', async (req, res) => {
  res.status(200).json({
    data: {
      user_pool_positions: [],
      req: req.network,
    },
  });
});

export default router;

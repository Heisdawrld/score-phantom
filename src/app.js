import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './api/routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// All routes under /api
app.use('/api', routes);

// Root
app.get('/', (req, res) => {
    res.json({
        service: 'ScorePhantom',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            stats: '/api/stats',
            fixtures: '/api/fixtures',
            fixture: '/api/fixtures/:id',
            tournaments: '/api/tournaments',
            predict: '/api/predict/:fixtureId',
            explain: '/api/predict/:fixtureId/explain',
        },
    });
});

app.listen(PORT, () => {
    console.log(`ScorePhantom running on port ${PORT}`);
});

export default app;

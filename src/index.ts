import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config';
import api from './api';
import './discord';

const app = express();
const PORT = process.env.PORT || 8001;

app.use(bodyParser.json({ limit: '8mb' }));
app.use(bodyParser.urlencoded({ limit: '8mb', extended: false }));
app.use(cors({ maxAge: 86400 }));

app.use('/api', api);

app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));

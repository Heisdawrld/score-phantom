import db from '../config/database.js';
import { createTrackRecordRouter } from './trackRecordRouter.js';

export default createTrackRecordRouter(db);

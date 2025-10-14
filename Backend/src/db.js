import mongoose from "mongoose";
import { logger } from './lib/logger.js';
export const connectDB = async (uri) => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName: "taller" });
  logger.info('mongo.connected.script', { uri: uri ? uri.split('@').pop() : 'unknown' });
};

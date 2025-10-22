import mongoose from "mongoose";
import { logger } from './logger.js';

export const connectDB = async (uri) => {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri, { dbName: "taller" });
    logger.info('mongo.connected.script', { uri: uri ? uri.split('@').pop() : 'unknown' });
  } catch (error) {
    logger.error('mongo.connection.failed', { error: error.message });
    throw error;
  }
};

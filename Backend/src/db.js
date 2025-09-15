import mongoose from "mongoose";
export const connectDB = async (uri) => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName: "taller" });
  console.log("MongoDB conectado");
};

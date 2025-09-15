import mongoose from "mongoose";
import bcrypt from "bcrypt";

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, uppercase: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

companySchema.methods.setPassword = async function(password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};
companySchema.methods.validatePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model("Company", companySchema);

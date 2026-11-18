import mongoose from 'mongoose';

export async function connectDb(uri = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27018/codearena') {
  await mongoose.connect(uri);
}
export { mongoose };
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  shop: { type: String, required: true, unique: true },
  apiKey: { type: String, required: true },
  storeId: { type: String, required: true },
  syncedPages: { type: [String], default: [] },
  syncedCategories: { type: [String], default: [] },
  syncedProducts: { type: [String], default: [] },
});

const User = mongoose.model('User', userSchema);

export default User;
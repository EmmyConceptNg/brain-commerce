import express from 'express';
import { validate } from '../controllers/validateController.js';
import { fetchShopifyStoreDetails, postToBrainCommerce } from '../controllers/shopifyController.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { apiKey, storeId } = req.body;

  try {
    const session = res.locals.shopify.session; // Get current session

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized - Missing Session' });
    }

    const storeDetails = await fetchShopifyStoreDetails(session);
    const shop = session.shop;

    // Pass the app instance to postToBrainCommerce
    await postToBrainCommerce(storeDetails, apiKey, storeId, req.app, shop, session);

    res.json({ success: true });
  } catch (error) {
    console.error("Error during validation and sync:", error);
    res.status(500).json({ error: 'Failed to validate and sync' });
  }
});

export default router;

import User from "../models/User.js";

/**
 * Creates a user for the given shop if it doesn't already exist.
 * Expects req.body.shop (string)
 */
export const createUserIfNotExists = async (req, res) => {
  try {
    // Get shop from the Shopify session (set by validateAuthenticatedSession)
    const shop = res.locals.shopify?.session?.shop;
    if (!shop) {
      return res.status(401).json({ error: "Unauthorized: No shop in session" });
    }

    let user = await User.findOne({ shop });
    if (user) {
      return res.status(200).json({ created: false, message: "User already exists", user });
    }

    user = new User({ shop, apiKey: "", storeId: "" });
    await user.save();

    res.status(201).json({ created: true, user });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
};
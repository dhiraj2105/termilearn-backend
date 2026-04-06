export const getAuthStatus = (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Auth route is reachable",
    });
  } catch (err) {
    console.error("Auth controller error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to reach auth route",
    });
  }
};

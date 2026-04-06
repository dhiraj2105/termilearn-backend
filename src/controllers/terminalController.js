export const getTerminalStatus = (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Terminal route is reachable",
    });
  } catch (err) {
    console.error("Terminal controller error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to reach terminal route",
    });
  }
};

// The physical width, in meters, that item QR codes should be printed
// at. Used to scale AR content to real-world size when anchored to a
// tracked QR code. Document this next to the QR code in the admin UI
// so whoever prints codes knows the assumed size.
export const PHYSICAL_QR_SIZE_METERS = 0.08;

// AR content is auto-scaled so each model's largest bounding-box dimension
// equals this many marker-widths, regardless of the model's own authored
// unit scale - most uploaded GLBs (especially downloaded ones) aren't
// authored in accurate real-world meters. 2x keeps the model clearly
// bigger than the printed marker without overwhelming the frame.
export const AR_MODEL_SIZE_MARKER_WIDTHS = 2;

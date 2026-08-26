import "./globals.css";

export const metadata = {
  title: "AR/QR Hub",
  description: "Scan a QR code to view 3D objects in AR",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

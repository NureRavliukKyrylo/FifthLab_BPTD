import { Navigate, Route, Routes } from "react-router-dom";
import Shop from "./pages/Shop";
import PaymentResult from "./pages/PaymentResult";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/shop" replace />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/payment-result" element={<PaymentResult />} />
      <Route path="*" element={<Navigate to="/shop" replace />} />
    </Routes>
  );
}

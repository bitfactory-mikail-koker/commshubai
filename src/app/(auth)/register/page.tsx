import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Omgeving aanmaken" };

export default function RegisterPage() {
  return <RegisterForm />;
}

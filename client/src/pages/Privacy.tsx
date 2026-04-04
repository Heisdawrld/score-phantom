import { Header } from "@/components/layout/Header";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-black mb-6">Privacy Policy</h1>
        <div className="prose prose-invert max-w-none text-white/70 space-y-4">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          
          <h2 className="text-xl font-bold text-white mt-8">1. Information We Collect</h2>
          <p>We collect information you provide directly to us, such as your email address when you create an account. We also automatically collect certain information about your device and usage of our service, including IP addresses, browser types, and interaction data.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">2. How We Use Your Information</h2>
          <p>We use the information we collect to provide, maintain, and improve our services, to process your transactions, to send you technical notices and support messages, and to communicate with you about products, services, and events.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">3. Information Sharing</h2>
          <p>We do not sell your personal information. We may share your information with third-party vendors, consultants, and other service providers who need access to such information to carry out work on our behalf (e.g., payment processors).</p>
          
          <h2 className="text-xl font-bold text-white mt-8">4. Data Security</h2>
          <p>We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">5. Your Choices</h2>
          <p>You may update, correct, or delete your account information at any time by logging into your account. You may also opt out of receiving promotional communications from us by following the instructions in those communications.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">6. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please contact us at support@scorephantom.com.</p>
        </div>
      </div>
    </div>
  );
}
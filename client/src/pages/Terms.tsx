import { Header } from "@/components/layout/Header";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-black mb-6">Terms of Service</h1>
        <div className="prose prose-invert max-w-none text-white/70 space-y-4">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          
          <h2 className="text-xl font-bold text-white mt-8">1. Acceptance of Terms</h2>
          <p>By accessing and using ScorePhantom, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">2. Description of Service</h2>
          <p>ScorePhantom provides data-driven football predictions and analytics. Our service is for informational and entertainment purposes only. We do not guarantee the accuracy of our predictions and are not responsible for any financial losses incurred through betting or gambling.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">3. User Accounts</h2>
          <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. We reserve the right to suspend or terminate accounts that violate these terms.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">4. Subscriptions and Payments</h2>
          <p>Premium features require a paid subscription. Payments are processed securely through our payment partners. Subscriptions automatically renew unless cancelled. Refunds are handled on a case-by-case basis according to our refund policy.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">5. Intellectual Property</h2>
          <p>All content, algorithms, and designs on ScorePhantom are our intellectual property. You may not copy, scrape, or redistribute our data without explicit permission.</p>
          
          <h2 className="text-xl font-bold text-white mt-8">6. Limitation of Liability</h2>
          <p>ScorePhantom is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
        </div>
      </div>
    </div>
  );
}
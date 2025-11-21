import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  MessageCircle, 
  Zap, 
  Check,
  Menu,
  Coffee,
  Store,
  Phone,
  TrendingUp,
  Box,
  User,
  Building2,
  Plus
} from 'lucide-react'

// Flomotive Design System Colors
const BRAND_RED = '#FF3B30'
const DARK_SURFACE = '#1A1A1A'

export function LandingPage() {
  const currentYear = new Date().getFullYear()
  
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px] py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND_RED }}>
              <Menu className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-black">WebNegosyo</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-gray-600 hover:text-black transition-colors">
              Features
            </Link>
            <Link href="#process" className="text-sm text-gray-600 hover:text-black transition-colors">
              Process
            </Link>
            <Link href="#pricing" className="text-sm text-gray-600 hover:text-black transition-colors">
              Pricing
            </Link>
            <Link href="#testimonials" className="text-sm text-gray-600 hover:text-black transition-colors">
              Testimonials
            </Link>
          </div>
          <Link href="/checkout?plan=pro">
            <Button 
              size="sm" 
              className="text-white font-semibold"
              style={{ backgroundColor: BRAND_RED }}
            >
              <Phone className="mr-2 h-4 w-4" />
              Book a 15-min Call
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 md:px-12 max-w-[1400px] py-16 md:py-24">
        <div className="max-w-5xl mx-auto">
          {/* Main Headline with Red Highlighting */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-black mb-6 leading-tight tracking-tight">
            Smart Menus That <span style={{ color: BRAND_RED }}>Convert</span>. Orders That Come to <span style={{ color: BRAND_RED }}>Messenger</span>.
          </h1>
          
          {/* Subheading */}
          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl leading-relaxed">
            Online menus and ordering systems for restaurants, coffee shops, and food businesses, with all orders delivered directly to your Messenger.
          </p>

          {/* Key Metrics */}
          <div className="flex gap-8 mb-12">
            <div>
              <div className="text-3xl font-bold text-black">+100</div>
              <div className="text-sm text-gray-600">Restaurants</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-black">5+</div>
              <div className="text-sm text-gray-600">Years Experience</div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="mb-16">
            <Link href="/checkout?plan=pro">
              <Button 
                size="lg" 
                className="text-white font-semibold text-lg px-8 py-6 rounded-lg"
                style={{ backgroundColor: BRAND_RED }}
              >
                Book a 15-min Call
                <Phone className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Value Proposition Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <Card className="border border-gray-200 shadow-sm bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5" style={{ color: BRAND_RED }} />
                  <span className="font-semibold text-black">Conversion Focused</span>
                </div>
                <p className="text-sm text-gray-600">Orders come directly to Messenger</p>
              </CardContent>
            </Card>
            <Card className="border border-gray-200 shadow-sm bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <Box className="h-5 w-5" style={{ color: BRAND_RED }} />
                  <span className="font-semibold text-black">100+ Restaurants</span>
                </div>
                <p className="text-sm text-gray-600">Trusted by Filipino businesses</p>
              </CardContent>
            </Card>
            <Card className="border border-gray-200 shadow-sm bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <User className="h-5 w-5" style={{ color: BRAND_RED }} />
                  <span className="font-semibold text-black">Simple Setup</span>
                </div>
                <p className="text-sm text-gray-600">Get started in minutes</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Businesses Stick With WebNegosyo */}
      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">
              Why Businesses Stick With WebNegosyo
            </h2>
            <p className="text-xl text-gray-600 mb-12 max-w-3xl">
              We don&apos;t just build menus. We create ordering systems backed by Messenger integration, 
              simplicity, and ongoing support—like an outsourced ordering department.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Conversion-Optimized */}
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-2xl mb-2 text-black">Conversion-Optimized Ordering</CardTitle>
                  <CardDescription className="text-base text-gray-600">
                    Customers order without login. All orders arrive in Messenger.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="text-3xl font-bold mb-1" style={{ color: BRAND_RED }}>2-4x</div>
                    <div className="text-sm text-gray-600">Faster Order Processing</div>
                  </div>
                  <p className="text-sm text-gray-600">
                    No login required. Direct ordering. Everything in Messenger.
                  </p>
                </CardContent>
              </Card>

              {/* Full-Scope Support */}
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-2xl mb-2 text-black">Full-Scope Menu Support</CardTitle>
                  <CardDescription className="text-base text-gray-600">
                    Everything you need for online ordering
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Menu Management</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Messenger Integration</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Order Tracking</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Custom Branding</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Mobile Responsive</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Customer Support</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Simple Execution */}
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-2xl mb-2 text-black">Simple Execution</CardTitle>
                  <CardDescription className="text-base text-gray-600">
                    No complexity. Just results.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Zap className="h-5 w-5 mt-0.5" style={{ color: BRAND_RED }} />
                      <div>
                        <div className="font-semibold text-black">No Login Required</div>
                        <div className="text-sm text-gray-600">Customers order instantly</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MessageCircle className="h-5 w-5 mt-0.5" style={{ color: BRAND_RED }} />
                      <div>
                        <div className="font-semibold text-black">Messenger Integration</div>
                        <div className="text-sm text-gray-600">All orders in one place</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fast & Flexible */}
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-2xl mb-2 text-black">Fast When It Matters. Flexible Always.</CardTitle>
                  <CardDescription className="text-base text-gray-600">
                    Choose what works for your business
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="font-semibold text-black mb-1">One-time Payment</div>
                      <div className="text-sm text-gray-600">Pay once, own forever</div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="font-semibold text-black mb-1">Lifetime Access</div>
                      <div className="text-sm text-gray-600">No monthly fees</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="process" className="py-20 bg-white">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">
              Our Process: Fast, Simple, <span style={{ color: BRAND_RED }}>Built Around You</span>
            </h2>
            <p className="text-xl text-gray-600 mb-12 max-w-3xl">
              Get your menu online in days, not weeks. Simple setup, ongoing support.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${BRAND_RED}1A` }}>
                  <span className="text-2xl font-bold" style={{ color: BRAND_RED }}>1</span>
                </div>
                <h3 className="text-xl font-semibold text-black mb-2">Kick Things Off</h3>
                <p className="text-gray-600">
                  Fill out our simple form. We&apos;ll contact you via Messenger to get started.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${BRAND_RED}1A` }}>
                  <span className="text-2xl font-bold" style={{ color: BRAND_RED }}>2</span>
                </div>
                <h3 className="text-xl font-semibold text-black mb-2">Setup Your Menu</h3>
                <p className="text-gray-600">
                  Add your menu items, set prices, customize branding. We&apos;re here to help.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${BRAND_RED}1A` }}>
                  <span className="text-2xl font-bold" style={{ color: BRAND_RED }}>3</span>
                </div>
                <h3 className="text-xl font-semibold text-black mb-2">Launch & Support</h3>
                <p className="text-gray-600">
                  Go live and start receiving orders in Messenger. We provide ongoing support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Work Across Industries */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-12 text-center">
              Work Across Industries
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Menu className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Restaurants</CardTitle>
                  <CardDescription className="text-gray-600">
                    Full-service restaurants, fast-casual, and fine dining establishments
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Coffee className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Coffee Shops</CardTitle>
                  <CardDescription className="text-gray-600">
                    Cafes, coffee shops, and beverage-focused businesses
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Store className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Food Businesses</CardTitle>
                  <CardDescription className="text-gray-600">
                    Bakeries, food trucks, catering, and any food-related business
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">
                <span style={{ color: BRAND_RED }}>Transparent</span> Pricing
              </h2>
              <p className="text-xl text-gray-600">
                One-time payment plans designed for Filipino businesses
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Starter Plan */}
              <Card className="border-2 border-gray-200 bg-white shadow-sm">
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl mb-2 text-black">Starter Plan</CardTitle>
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-5xl font-bold text-black">₱999</span>
                  </div>
                  <CardDescription className="text-base text-gray-600">
                    One-time payment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Unlimited menu items</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Messenger integration</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Mobile-responsive menu</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Customer support</span>
                    </li>
                  </ul>
                  <Link href="/checkout?plan=starter" className="block">
                    <Button 
                      size="lg" 
                      className="w-full bg-black hover:bg-gray-900 text-white rounded-lg"
                    >
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Pro Plan */}
              <Card className="border-2 relative shadow-md" style={{ borderColor: BRAND_RED }}>
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="px-4 py-1 text-white rounded-full" style={{ backgroundColor: BRAND_RED }}>
                    Most Popular
                  </Badge>
                </div>
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl mb-2 text-black">Pro Plan</CardTitle>
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-5xl font-bold text-black">₱1,899</span>
                  </div>
                  <CardDescription className="text-base text-gray-600">
                    One-time payment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Everything in Starter</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Manage menu items</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">View orders on Messenger</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">View orders on dashboard</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Change branding colors</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BRAND_RED }} />
                      <span className="text-gray-700">Priority support</span>
                    </li>
                  </ul>
                  <Link href="/checkout?plan=pro" className="block">
                    <Button 
                      size="lg" 
                      className="w-full text-white font-semibold rounded-lg"
                      style={{ backgroundColor: BRAND_RED }}
                    >
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-12 text-center">
              <span style={{ color: BRAND_RED }}>Real Clients</span>. Real Results.
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    &quot;WebNegosyo made it so easy for our customers to order. All orders come 
                    directly to our Messenger—no need to check multiple apps. Game changer!&quot;
                  </p>
                  <div className="font-semibold text-black">Maria Santos</div>
                  <div className="text-sm text-gray-600">Owner, Bella Italia Restaurant</div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    &quot;Starting at ₱999, it&apos;s so affordable. Our customers love ordering 
                    without creating accounts. Orders just appear in Messenger. Perfect!&quot;
                  </p>
                  <div className="font-semibold text-black">Juan dela Cruz</div>
                  <div className="text-sm text-gray-600">Manager, Coffee Paradise</div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    &quot;The Pro Plan gives us full control. We can manage our menu, see all orders, 
                    and customize everything. Worth every peso!&quot;
                  </p>
                  <div className="font-semibold text-black">Anna Garcia</div>
                  <div className="text-sm text-gray-600">Founder, Sushi Express</div>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    &quot;Setup was quick, support is great. Our sales increased because customers 
                    can order so easily. Highly recommend!&quot;
                  </p>
                  <div className="font-semibold text-black">Roberto Tan</div>
                  <div className="text-sm text-gray-600">Owner, Burger Haven</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-12 text-center">
              Good Questions. Clear Answers.
            </h2>
            <div className="space-y-4">
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-black">
                    <span>What kind of businesses do you work with?</span>
                    <Plus className="h-5 w-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    We work with restaurants, coffee shops, bakeries, food trucks, catering businesses, 
                    and any food-related business in the Philippines.
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-black">
                    <span>How does the Messenger integration work?</span>
                    <Plus className="h-5 w-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    When customers place orders on your website, all order details are automatically 
                    sent to your Facebook Messenger. You&apos;ll receive a formatted message with 
                    all the order information, ready to process.
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-black">
                    <span>Do customers need to create an account?</span>
                    <Plus className="h-5 w-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    No! Customers can order directly without creating an account or logging in. 
                    This makes ordering faster and more convenient for your customers.
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-black">
                    <span>What&apos;s the difference between Starter and Pro plans?</span>
                    <Plus className="h-5 w-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    Starter Plan includes the basic menu and Messenger integration. Pro Plan adds 
                    menu management, order viewing on both Messenger and dashboard, custom branding, 
                    and priority support.
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-black">
                    <span>Is this a one-time payment or monthly?</span>
                    <Plus className="h-5 w-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    Both plans are one-time payments. Pay once and own your menu system forever. 
                    No monthly fees, no recurring charges.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Deliverables Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">
              Everything You Need to Start Ordering Online
            </h2>
            <p className="text-xl text-gray-600 mb-12 max-w-3xl">
              From menu management to Messenger integration, here&apos;s how we help your business grow.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Menu className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Online Menu</CardTitle>
                  <CardDescription className="text-gray-600">
                    Beautiful, mobile-responsive menu with categories and items
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <MessageCircle className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Messenger Integration</CardTitle>
                  <CardDescription className="text-gray-600">
                    All orders delivered directly to your Facebook Messenger
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Building2 className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Custom Branding</CardTitle>
                  <CardDescription className="text-gray-600">
                    Customize colors and logo to match your brand
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <TrendingUp className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Order Management</CardTitle>
                  <CardDescription className="text-gray-600">
                    View and track orders on Messenger and dashboard
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Zap className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Fast Setup</CardTitle>
                  <CardDescription className="text-gray-600">
                    Get your menu online in minutes, not days
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="border border-gray-200 bg-white shadow-sm">
                <CardHeader>
                  <Check className="h-8 w-8 mb-2" style={{ color: BRAND_RED }} />
                  <CardTitle className="text-black">Ongoing Support</CardTitle>
                  <CardDescription className="text-gray-600">
                    We&apos;re here to help whenever you need it
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 text-white" style={{ backgroundColor: DARK_SURFACE }}>
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px] text-center">
          <div className="max-w-3xl mx-auto">
            <Zap className="h-12 w-12 mx-auto mb-6" style={{ color: BRAND_RED }} />
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Want an ordering system that puts your customers first?
            </h2>
            <Link href="/checkout?plan=pro">
              <Button 
                size="lg" 
                className="text-white font-semibold text-lg px-8 py-6 mt-8 rounded-lg"
                style={{ backgroundColor: BRAND_RED }}
              >
                Book a call with WebNegosyo
              </Button>
            </Link>
            <p className="text-gray-400 mt-6">
              We&apos;re available this week
            </p>
            <p className="text-gray-400 mt-2">
              Prefer to message us? <Link href="https://m.me/WebNegosyoOfficial" className="underline hover:no-underline" style={{ color: BRAND_RED }}>On Messenger</Link>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="container mx-auto px-6 md:px-12 max-w-[1400px] py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND_RED }}>
                  <Menu className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-black">WebNegosyo</span>
              </div>
              <p className="text-sm text-gray-600">
                Smart menu system for Filipino businesses. 
                Order directly through Messenger—simple, comfortable, affordable.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-black mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <Link href="#features" className="hover:text-black transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-black transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#process" className="hover:text-black transition-colors">
                    Process
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-black mb-4">Get Started</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <Link href="/checkout?plan=pro" className="hover:text-black transition-colors">
                    Book a Call
                  </Link>
                </li>
                <li>
                  <Link href="https://m.me/WebNegosyoOfficial" className="hover:text-black transition-colors">
                    Message on Messenger
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
            <p>© {currentYear} WebNegosyo. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

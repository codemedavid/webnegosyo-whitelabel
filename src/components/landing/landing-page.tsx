import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  MessageCircle, 
  Zap, 
  Check,
  ArrowRight,
  Menu,
  Coffee,
  Store,
  Phone,
  TrendingUp,
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
      <section className="w-full pt-16 md:pt-24 pb-32 md:pb-40" style={{ backgroundColor: '#FAFBFC' }}>
        <div className="container mx-auto px-6 md:px-12 max-w-[1280px]">
          <div className="max-w-5xl mx-auto">
            {/* Social Proof Badges */}
            <div className="flex justify-center items-center gap-4 mb-10 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: '#F9FAFB' }}>
                <span className="text-base leading-none">🍕</span>
                <span className="text-sm font-medium" style={{ color: '#666666' }}>100+ Restaurants</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: '#F9FAFB' }}>
                <span className="text-base leading-none">📱</span>
                <span className="text-sm font-medium" style={{ color: '#666666' }}>10K+ Orders Delivered</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ backgroundColor: '#F9FAFB' }}>
                <span className="text-base leading-none">⚡</span>
                <span className="text-sm font-medium" style={{ color: '#666666' }}>Works on Messenger & WhatsApp</span>
              </div>
            </div>

            {/* Main Headline with Red Highlighting */}
            <h1 
              className="font-extrabold text-black text-center mx-auto mb-12 leading-[1.1]"
              style={{
                fontSize: 'clamp(38px, 7vw, 80px)',
                letterSpacing: '-0.03em',
                maxWidth: '1100px',
                fontWeight: 800
              }}
            >
              Smart Menus That <span style={{ color: BRAND_RED }}>Convert</span>. Orders That Come to <span style={{ color: BRAND_RED }}>Messenger</span>.
            </h1>
            
            {/* Description */}
            <p 
              className="text-center mx-auto mb-12"
              style={{
                fontSize: '18px',
                lineHeight: '1.7',
                color: '#6B7280',
                maxWidth: '640px',
                fontWeight: 400
              }}
            >
              Digital menus for restaurants and food businesses that take orders directly through Messenger, WhatsApp, and social platforms.
            </p>

            {/* CTA Button */}
            <div className="flex justify-center mb-24 md:mb-28">
              <Link href="/checkout?plan=pro">
                <Button 
                  size="lg" 
                  className="hero-button-hover text-white font-semibold inline-flex items-center gap-2"
                  style={{ 
                    backgroundColor: BRAND_RED,
                    padding: '16px 40px',
                    fontSize: '17px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(255, 59, 48, 0.25)'
                  }}
                >
                  Create Your Menu
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>

            {/* Logo Strip with Auto-Scrolling Marquee */}
            <div 
              className="relative mt-20 md:mt-28 mb-20 md:mb-28 overflow-hidden"
              style={{
                borderTop: '1px solid #E5E7EB',
                borderBottom: '1px solid #E5E7EB',
                paddingTop: '48px',
                paddingBottom: '48px'
              }}
            >
              {/* Gradient Masks */}
              <div 
                className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none"
                style={{
                  width: '120px',
                  background: 'linear-gradient(to right, #FAFBFC, transparent)'
                }}
              />
              <div 
                className="absolute right-0 top-0 bottom-0 z-10 pointer-events-none"
                style={{
                  width: '120px',
                  background: 'linear-gradient(to left, #FAFBFC, transparent)'
                }}
              />
              
              <div className="text-center mb-8">
                <p 
                  className="uppercase"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    color: '#9CA3AF'
                  }}
                >
                  TRUSTED BY RESTAURANTS NATIONWIDE
                </p>
              </div>
              
              {/* Marquee Track */}
              <div className="hero-marquee flex items-center gap-16">
                {/* First set of logos */}
                {[...Array(6)].map((_, i) => (
                  <div 
                    key={`logo-1-${i}`}
                    className="hero-logo-hover flex-shrink-0"
                    style={{ height: '36px' }}
                  >
                    <span className="text-sm font-semibold" style={{ color: '#9CA3AF' }}>RESTAURANT LOGO</span>
                  </div>
                ))}
                {/* Duplicate set for seamless loop */}
                {[...Array(6)].map((_, i) => (
                  <div 
                    key={`logo-2-${i}`}
                    className="hero-logo-hover flex-shrink-0"
                    style={{ height: '36px' }}
                  >
                    <span className="text-sm font-semibold" style={{ color: '#9CA3AF' }}>RESTAURANT LOGO</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Portfolio Showcase Carousel */}
            <div className="max-w-[1200px] mx-auto px-6 mb-20 md:mb-28 relative overflow-hidden">
              {/* Gradient Masks */}
              <div 
                className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none"
                style={{
                  width: '120px',
                  background: 'linear-gradient(to right, #FAFBFC, transparent)'
                }}
              />
              <div 
                className="absolute right-0 top-0 bottom-0 z-10 pointer-events-none"
                style={{
                  width: '120px',
                  background: 'linear-gradient(to left, #FAFBFC, transparent)'
                }}
              />
              
              {/* Carousel Track */}
              <div className="hero-carousel flex gap-8">
                {/* Portfolio Cards - First Set */}
                {[
                  {
                    icon: Menu,
                    badge: 'Restaurant',
                    title: 'Pizza Place Menu with Live Orders',
                    description: 'Interactive menu with real-time ordering to Messenger'
                  },
                  {
                    icon: Coffee,
                    badge: 'Café',
                    title: 'Coffee Shop Quick Order System',
                    description: 'Browse menu and order ahead via WhatsApp'
                  },
                  {
                    icon: Store,
                    badge: 'Food Truck',
                    title: 'Food Truck Daily Specials Board',
                    description: 'Dynamic menu with location-based ordering'
                  }
                ].map((card, i) => (
                  <Card 
                    key={`card-1-${i}`}
                    className="hero-card-hover flex-shrink-0 bg-white overflow-hidden cursor-pointer relative"
                    style={{
                      minWidth: '380px',
                      width: '380px',
                      borderRadius: '16px',
                      border: '1px solid #E5E7EB'
                    }}
                  >
                    <div className="w-full aspect-[4/3] relative" style={{ backgroundColor: '#F3F4F6' }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <card.icon className="h-14 w-14" style={{ color: '#D1D5DB' }} />
                      </div>
                      <div 
                        className="absolute bottom-3 left-3"
                        style={{
                          backgroundColor: '#000000',
                          color: '#FFFFFF',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        {card.badge}
                      </div>
                    </div>
                    <CardContent className="p-6">
                      <CardTitle 
                        className="mb-2"
                        style={{
                          fontSize: '20px',
                          fontWeight: 600,
                          color: '#111827',
                          lineHeight: '1.3'
                        }}
                      >
                        {card.title}
                      </CardTitle>
                      <CardDescription 
                        style={{
                          fontSize: '15px',
                          fontWeight: 400,
                          color: '#6B7280',
                          lineHeight: '1.6'
                        }}
                      >
                        {card.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
                
                {/* Duplicate Set for Seamless Loop */}
                {[
                  {
                    icon: Menu,
                    badge: 'Restaurant',
                    title: 'Pizza Place Menu with Live Orders',
                    description: 'Interactive menu with real-time ordering to Messenger'
                  },
                  {
                    icon: Coffee,
                    badge: 'Café',
                    title: 'Coffee Shop Quick Order System',
                    description: 'Browse menu and order ahead via WhatsApp'
                  },
                  {
                    icon: Store,
                    badge: 'Food Truck',
                    title: 'Food Truck Daily Specials Board',
                    description: 'Dynamic menu with location-based ordering'
                  }
                ].map((card, i) => (
                  <Card 
                    key={`card-2-${i}`}
                    className="hero-card-hover flex-shrink-0 bg-white overflow-hidden cursor-pointer relative"
                    style={{
                      minWidth: '380px',
                      width: '380px',
                      borderRadius: '16px',
                      border: '1px solid #E5E7EB'
                    }}
                  >
                    <div className="w-full aspect-[4/3] relative" style={{ backgroundColor: '#F3F4F6' }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <card.icon className="h-14 w-14" style={{ color: '#D1D5DB' }} />
                      </div>
                      <div 
                        className="absolute bottom-3 left-3"
                        style={{
                          backgroundColor: '#000000',
                          color: '#FFFFFF',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        {card.badge}
                      </div>
                    </div>
                    <CardContent className="p-6">
                      <CardTitle 
                        className="mb-2"
                        style={{
                          fontSize: '20px',
                          fontWeight: 600,
                          color: '#111827',
                          lineHeight: '1.3'
                        }}
                      >
                        {card.title}
                      </CardTitle>
                      <CardDescription 
                        style={{
                          fontSize: '15px',
                          fontWeight: 400,
                          color: '#6B7280',
                          lineHeight: '1.6'
                        }}
                      >
                        {card.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Stats Bar */}
            <div className="max-w-[900px] mx-auto mt-20 md:mt-28 mb-0 px-6 py-10 rounded-2xl" style={{ backgroundColor: '#F9FAFB' }}>
              <div className="flex justify-around items-center flex-wrap gap-8">
                <div className="flex flex-col items-center text-center min-w-[150px]">
                  <MessageCircle className="h-12 w-12 mb-3 text-black" />
                  <div className="text-base font-semibold text-black mb-1">
                    Messenger Integration
                  </div>
                  <div className="text-sm text-gray-600">
                    Orders direct to chat
                  </div>
                </div>
                <div className="flex flex-col items-center text-center min-w-[150px]">
                  <TrendingUp className="h-12 w-12 mb-3 text-black" />
                  <div className="text-base font-semibold text-black mb-1">
                    3x More Orders
                  </div>
                  <div className="text-sm text-gray-600">
                    Average conversion increase
                  </div>
                </div>
                <div className="flex flex-col items-center text-center min-w-[150px]">
                  <Zap className="h-12 w-12 mb-3 text-black" />
                  <div className="text-base font-semibold text-black mb-1">
                    Setup in Minutes
                  </div>
                  <div className="text-sm text-gray-600">
                    No coding required
                  </div>
                </div>
              </div>
            </div>
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

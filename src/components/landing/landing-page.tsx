'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    ArrowRight,
    Check,
    MessageCircle,
    Smartphone,
    Zap,
    Heart,
    DollarSign,
    Coffee,
    UtensilsCrossed,
    Store,
    ChevronDown,
    Menu,
    X
} from 'lucide-react'
import { useState } from 'react'

export function LandingPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [openFaq, setOpenFaq] = useState<number | null>(null)

    const toggleFaq = (index: number) => {
        setOpenFaq(openFaq === index ? null : index)
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-6 w-6 text-[#FF3B30]" />
                            <span className="text-xl font-bold">WebNegosyo</span>
                        </div>

                        {/* Desktop Navigation */}
                        <div className="hidden md:flex items-center gap-6">
                            <Link href="#features" className="text-sm font-medium hover:text-[#FF3B30] transition-colors">
                                Features
                            </Link>
                            <Link href="#pricing" className="text-sm font-medium hover:text-[#FF3B30] transition-colors">
                                Pricing
                            </Link>
                            <Link href="#faq" className="text-sm font-medium hover:text-[#FF3B30] transition-colors">
                                FAQ
                            </Link>
                            <Link href="/superadmin/login">
                                <Button variant="ghost" size="sm">
                                    Login
                                </Button>
                            </Link>
                            <Link href="/superadmin/tenants/new">
                                <Button size="sm" className="bg-[#FF3B30] hover:bg-[#FF3B30]/90">
                                    Get Started <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>

                        {/* Mobile Menu Button */}
                        <button
                            className="md:hidden"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                    </div>

                    {/* Mobile Menu */}
                    {mobileMenuOpen && (
                        <div className="md:hidden py-4 space-y-4">
                            <Link href="#features" className="block text-sm font-medium hover:text-[#FF3B30]">
                                Features
                            </Link>
                            <Link href="#pricing" className="block text-sm font-medium hover:text-[#FF3B30]">
                                Pricing
                            </Link>
                            <Link href="#faq" className="block text-sm font-medium hover:text-[#FF3B30]">
                                FAQ
                            </Link>
                            <div className="flex flex-col gap-2 pt-2">
                                <Link href="/superadmin/login">
                                    <Button variant="ghost" size="sm" className="w-full">
                                        Login
                                    </Button>
                                </Link>
                                <Link href="/superadmin/tenants/new">
                                    <Button size="sm" className="w-full bg-[#FF3B30] hover:bg-[#FF3B30]/90">
                                        Get Started
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative overflow-hidden py-20 lg:py-32">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="mx-auto max-w-3xl text-center">
                        <Badge className="mb-6 bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20">
                            Smart Menu System for Filipino Businesses
                        </Badge>

                        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl mb-6">
                            Websites That <span className="text-[#FF3B30]">Convert</span>.<br />
                            A Design Partner<br />
                            That Sticks Around.
                        </h1>

                        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
                            Your customers order online. You get every order in Messenger. Beautiful online menu, simple ordering. No login required, all orders come to your Messenger.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/superadmin/tenants/new">
                                <Button size="lg" className="bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-base px-8 hero-button-hover">
                                    Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href="#features">
                                <Button size="lg" variant="outline" className="text-base px-8">
                                    Learn More
                                </Button>
                            </Link>
                        </div>

                        <p className="text-sm text-gray-500 mt-6">
                            Starting at <span className="font-semibold text-[#FF3B30]">₱999/month</span>
                        </p>
                    </div>
                </div>
            </section>

            {/* Logo Grid / Social Proof */}
            <section className="py-12 border-y bg-gray-50">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <p className="text-center text-sm font-medium text-gray-600 mb-8">
                        Trusted by Filipino businesses
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center opacity-60">
                        <div className="flex items-center gap-2">
                            <Coffee className="h-8 w-8" />
                            <span className="font-semibold">Coffee Shops</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <UtensilsCrossed className="h-8 w-8" />
                            <span className="font-semibold">Restaurants</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Store className="h-8 w-8" />
                            <span className="font-semibold">Food Stalls</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-8 w-8" />
                            <span className="font-semibold">Online Sellers</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Showcase Grid */}
            <section className="py-20 lg:py-32">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">
                            Our Process: <span className="text-[#FF3B30]">Fast, Async,</span><br />
                            and <span className="text-[#FF3B30]">Built Around You</span>
                        </h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            See how WebNegosyo transforms your business with a simple, powerful ordering system
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <Card className="hero-card-hover border-gray-200">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center mb-4">
                                    <Smartphone className="h-6 w-6 text-[#FF3B30]" />
                                </div>
                                <CardTitle>Customer Views Menu</CardTitle>
                                <CardDescription>
                                    Beautiful, mobile-responsive menu that works on any device
                                </CardDescription>
                            </CardHeader>
                        </Card>

                        <Card className="hero-card-hover border-gray-200">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center mb-4">
                                    <MessageCircle className="h-6 w-6 text-[#FF3B30]" />
                                </div>
                                <CardTitle>Order via Messenger</CardTitle>
                                <CardDescription>
                                    Orders sent directly to your Facebook Messenger - no app needed
                                </CardDescription>
                            </CardHeader>
                        </Card>

                        <Card className="hero-card-hover border-gray-200">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center mb-4">
                                    <Check className="h-6 w-6 text-[#FF3B30]" />
                                </div>
                                <CardTitle>You Confirm & Deliver</CardTitle>
                                <CardDescription>
                                    Manage orders easily through your dashboard or Messenger
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-20 lg:py-32 bg-gray-50">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">
                            Why Founder <span className="text-[#FF3B30]">Stick</span><br />
                            With <span className="text-[#FF3B30]">Flomotive</span>
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Simplicity */}
                        <Card className="border-gray-200">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center mb-4">
                                    <Zap className="h-6 w-6 text-[#FF3B30]" />
                                </div>
                                <CardTitle className="flex items-center gap-2">
                                    Simplicity <span className="text-2xl">⚡</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">No login or signup required for customers</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Direct ordering in seconds</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">One-click ordering experience</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Mobile-friendly interface</span>
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Comfort */}
                        <Card className="border-gray-200">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center mb-4">
                                    <Heart className="h-6 w-6 text-[#FF3B30]" />
                                </div>
                                <CardTitle className="flex items-center gap-2">
                                    Comfort <span className="text-2xl">❤️</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Familiar Messenger interface</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">No repeated menu sending</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Automated order processing</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Built for Filipino customers</span>
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Affordability */}
                        <Card className="border-gray-200">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center mb-4">
                                    <DollarSign className="h-6 w-6 text-[#FF3B30]" />
                                </div>
                                <CardTitle className="flex items-center gap-2">
                                    Affordability <span className="text-2xl">💰</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Starting at ₱999/month</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Transparent pricing</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">No hidden fees</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span className="text-gray-600">Accessible for all businesses</span>
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Process Steps */}
            <section className="py-20 lg:py-32">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">
                            Deliverables that Move<br />
                            your <span className="text-[#FF3B30]">Business Forward</span>
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <Card className="border-gray-200 text-center">
                            <CardHeader>
                                <div className="w-16 h-16 rounded-full bg-[#FF3B30] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                                    1
                                </div>
                                <CardTitle>Setup Your Menu</CardTitle>
                                <CardDescription className="text-base">
                                    Add your products, categories, and pricing in minutes through our easy dashboard
                                </CardDescription>
                            </CardHeader>
                        </Card>

                        <Card className="border-gray-200 text-center">
                            <CardHeader>
                                <div className="w-16 h-16 rounded-full bg-[#FF3B30] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                                    2
                                </div>
                                <CardTitle>Share Your Link</CardTitle>
                                <CardDescription className="text-base">
                                    Get your custom menu link and share it with customers via social media
                                </CardDescription>
                            </CardHeader>
                        </Card>

                        <Card className="border-gray-200 text-center">
                            <CardHeader>
                                <div className="w-16 h-16 rounded-full bg-[#FF3B30] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                                    3
                                </div>
                                <CardTitle>Receive Orders</CardTitle>
                                <CardDescription className="text-base">
                                    All orders arrive in your Messenger - confirm and deliver with ease
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-20 lg:py-32 bg-gray-50">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">
                            <span className="text-[#FF3B30]">Transparent</span> Pricing
                        </h2>
                        <p className="text-lg text-gray-600">
                            Simple, affordable pricing for Filipino businesses
                        </p>
                    </div>

                    <div className="max-w-lg mx-auto">
                        <Card className="border-2 border-[#FF3B30] shadow-lg">
                            <CardHeader className="text-center pb-8">
                                <Badge className="mb-4 bg-[#FF3B30] text-white mx-auto">
                                    Most Popular
                                </Badge>
                                <CardTitle className="text-3xl mb-2">Starter Plan</CardTitle>
                                <div className="mt-4">
                                    <span className="text-5xl font-bold">₱999</span>
                                    <span className="text-gray-600">/month</span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-4 mb-8">
                                    <li className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span>Unlimited menu items and categories</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span>Messenger order integration</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span>Custom branding and colors</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span>Order management dashboard</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span>Mobile-responsive menu</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <Check className="h-5 w-5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
                                        <span>Customer support</span>
                                    </li>
                                </ul>

                                <Link href="/superadmin/tenants/new" className="block">
                                    <Button className="w-full bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-lg py-6">
                                        Get Started Now <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="py-20 lg:py-32">
                <div className="mx-auto max-w-3xl px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">
                            <span className="text-[#FF3B30]">Good Questions.</span><br />
                            <span className="text-[#FF3B30]">Clear Answers.</span>
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {[
                            {
                                question: "How does the Messenger integration work?",
                                answer: "When a customer places an order through your menu, it's automatically sent to your Facebook Messenger. You'll receive a formatted message with all order details, and you can confirm or communicate with the customer directly through Messenger."
                            },
                            {
                                question: "Do my customers need to create an account?",
                                answer: "No! That's the beauty of WebNegosyo. Customers can browse your menu and place orders without any login or signup. They just need to provide their delivery details when checking out."
                            },
                            {
                                question: "Can I customize the look of my menu?",
                                answer: "Yes! You can customize your menu colors, logo, and branding through the admin dashboard. Make it match your business identity perfectly."
                            },
                            {
                                question: "What payment methods are supported?",
                                answer: "Currently, WebNegosyo supports cash on delivery and various online payment methods. You can enable/disable payment methods based on your business needs."
                            },
                            {
                                question: "Is there a setup fee?",
                                answer: "No setup fees! Just ₱999/month with no hidden costs. You can cancel anytime."
                            },
                            {
                                question: "How quickly can I get started?",
                                answer: "You can set up your complete menu and start accepting orders in less than 30 minutes. Our dashboard is designed to be simple and intuitive."
                            }
                        ].map((faq, index) => (
                            <div key={index} className="border-b border-gray-200">
                                <button
                                    onClick={() => toggleFaq(index)}
                                    className="w-full py-5 flex items-center justify-between text-left hover:text-[#FF3B30] transition-colors"
                                >
                                    <span className="font-semibold text-lg pr-8">{faq.question}</span>
                                    <ChevronDown
                                        className={`h-5 w-5 flex-shrink-0 transition-transform ${openFaq === index ? 'rotate-180' : ''
                                            }`}
                                    />
                                </button>
                                {openFaq === index && (
                                    <div className="pb-5 text-gray-600 leading-relaxed">
                                        {faq.answer}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Final CTA Section */}
            <section className="py-20 lg:py-32 bg-black text-white">
                <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
                    <h2 className="text-4xl lg:text-5xl font-bold mb-6">
                        Want a design partner that<br />
                        puts your <span className="text-[#FF3B30]">results first?</span>
                    </h2>

                    <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
                        Join Filipino businesses already using WebNegosyo to streamline their online ordering
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                        <Link href="/superadmin/tenants/new">
                            <Button size="lg" className="bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-base px-8">
                                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                        <Link href="/superadmin/login">
                            <Button size="lg" variant="outline" className="text-base px-8 border-white text-white hover:bg-white hover:text-black">
                                Login to Dashboard
                            </Button>
                        </Link>
                    </div>

                    <p className="text-sm text-gray-400">
                        No credit card required • Setup in minutes • Cancel anytime
                    </p>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-50 border-t">
                <div className="mx-auto max-w-7xl px-6 lg:px-8 py-12">
                    <div className="grid md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <MessageCircle className="h-6 w-6 text-[#FF3B30]" />
                                <span className="text-xl font-bold">WebNegosyo</span>
                            </div>
                            <p className="text-sm text-gray-600">
                                Smart menu system for Filipino businesses
                            </p>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-4">Product</h3>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li><Link href="#features" className="hover:text-[#FF3B30]">Features</Link></li>
                                <li><Link href="#pricing" className="hover:text-[#FF3B30]">Pricing</Link></li>
                                <li><Link href="#faq" className="hover:text-[#FF3B30]">FAQ</Link></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-4">Get Started</h3>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li><Link href="/superadmin/tenants/new" className="hover:text-[#FF3B30]">Sign Up</Link></li>
                                <li><Link href="/superadmin/login" className="hover:text-[#FF3B30]">Login</Link></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-4">Support</h3>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li><Link href="#" className="hover:text-[#FF3B30]">Contact Us</Link></li>
                                <li><Link href="#" className="hover:text-[#FF3B30]">Help Center</Link></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t pt-8 text-center text-sm text-gray-600">
                        <p>&copy; {new Date().getFullYear()} WebNegosyo. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}

# 🚀 Quick Start Guide

## Get Running in 2 Minutes

### Step 1: Install
```bash
npm install
```

### Step 2: Run
```bash
npm run dev
```

### Step 3: Explore!

Visit [http://localhost:3000](http://localhost:3000) and you'll be redirected to **Bella Italia** restaurant menu.

## 🍕 What to Try

### As a Customer

1. **Browse the Menu**
   - Visit: `http://localhost:3000/bella-italia/menu`
   - Filter by categories (Pizza, Pasta, Desserts, etc.)
   - Search for items
   - Click on any item to see details

2. **Customize Your Order**
   - Click "Add to Cart" on any item
   - Select size variations (Small, Medium, Large)
   - Add extras (Extra Cheese, Add Bacon, etc.)
   - Add special instructions
   - Adjust quantity

3. **Checkout**
   - Click cart icon (top right)
   - Review your order
   - Proceed to checkout
   - See the formatted Messenger message

### As a Restaurant Admin

1. **View Dashboard**
   - Visit: `http://localhost:3000/bella-italia/admin`
   - See statistics (total items, categories, featured items)

2. **Manage Menu**
   - Go to: `http://localhost:3000/bella-italia/admin/menu`
   - Search and filter items
   - Click "Edit" on any item
   - Try adding a new item
   - Configure variations and add-ons

3. **Organize Categories**
   - Go to: `http://localhost:3000/bella-italia/admin/categories`
   - Add, edit, or delete categories
   - Add emoji icons

### As a Super Admin

1. **View All Tenants**
   - Visit: `http://localhost:3000/superadmin`
   - See all restaurants

2. **Manage Tenants**
   - Go to: `http://localhost:3000/superadmin/tenants`
   - Click "Edit" on any restaurant
   - Try the color pickers
   - Update branding

3. **Create New Restaurant**
   - Click "Add Tenant"
   - Fill in the form
   - Set custom colors
   - Configure Messenger integration

## 🎨 Demo Restaurants

Try these different restaurant menus:

1. **Bella Italia** (Italian)
   - `http://localhost:3000/bella-italia/menu`
   - Pizza, Pasta, Italian desserts

2. **Sushi Paradise** (Japanese)
   - `http://localhost:3000/sushi-paradise/menu`
   - (Uses same mock data for demo)

3. **Burger Haven** (American)
   - `http://localhost:3000/burger-haven/menu`
   - (Uses same mock data for demo)

## 💡 Pro Tips

- **Cart persists** - Add items from different pages
- **Responsive** - Try it on mobile (Cmd+Shift+M in Chrome)
- **Search works** - Try searching for "pizza" or "pasta"
- **Categories filter** - Click category tabs to filter
- **Price calculations** - Watch totals update in real-time

## 🔍 Code Organization

```
/src/app/[tenant]/
  menu/          → Customer menu page
  cart/          → Cart review
  checkout/      → Messenger integration
  admin/         → Admin dashboard

/src/components/
  customer/      → Menu, cart, items
  admin/         → Forms, management
  shared/        → Reusable components

/src/lib/
  mockData.ts    → All demo data here!
```

## 🛠️ Common Tasks

### Add a Menu Item (Mock)
Edit `/src/lib/mockData.ts` and add to `mockMenuItems` array

### Add a Restaurant
Edit `/src/lib/mockData.ts` and add to `mockTenants` array

### Change Colors
Visit super admin → Edit tenant → Branding section

### Test Messenger Integration
Go through checkout - see the formatted message that would be sent

## ❓ FAQ

**Q: Why am I redirected to bella-italia?**  
A: The home page (`/`) redirects to the first tenant's menu automatically.

**Q: Where's the authentication?**  
A: The middleware is set up, but auth needs Supabase. The app works without it for testing.

**Q: Can I change the mock data?**  
A: Yes! Edit `/src/lib/mockData.ts` with your own restaurants and items.

**Q: How do I connect to a real database?**  
A: See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for Supabase setup instructions.

**Q: Build failing?**  
A: Run `npm run build` to see errors. All TypeScript and lint errors are fixed in the current version.

## 🎯 Next Steps

1. ✅ Explore all features (you're here!)
2. 📖 Read [IMPLEMENTATION.md](./IMPLEMENTATION.md) for details
3. 🗄️ Set up Supabase database
4. 🔐 Implement authentication
5. 🚀 Deploy to Vercel

## 🐛 Issues?

Build working? ✅ (`npm run build` passes)  
Dev server running? ✅ (`npm run dev`)  
All features working? ✅

If you encounter issues:
1. Clear `.next` folder: `rm -rf .next`
2. Reinstall: `rm -rf node_modules && npm install`
3. Check Node version: `node -v` (should be 20+)

---

**Happy coding! 🎉**


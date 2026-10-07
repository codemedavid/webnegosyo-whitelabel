import {
  FUNNEL_DAILY_PRICE,
  FUNNEL_PRICE,
  SETUP_FEE_WAIVED,
  formatPeso,
  stackTotalValue,
} from './funnel-offer'

/**
 * Every word on /funnel, in Taglish: roughly half English (the promise,
 * outcomes and feature names) and half Tagalog (the transitions, connectors
 * and feelings). Drafted by ChatGPT from a Russell Brunson brief and edited
 * against the real offer.
 *
 * The page sells growth (more customers ordering, bigger orders, regulars who
 * come back). Commission is a supporting line, never the hook.
 *
 *   STAR      callout → promise → core-desire questions → agitate
 *   STORY     three leaks → the Big Lie → Epiphany Bridge → Big Domino
 *   SOLUTION  three secrets (vehicle / internal / external belief) → proof →
 *             stack (cost of no, If/All, reveal) → guarantee → future pacing
 *             → fit → two options → order → FAQ → P.S.
 *
 * Only real claims: no invented results, names, ratings or review counts.
 * Hypothetical math is always framed as "halimbawa".
 */

const PRICE = formatPeso(FUNNEL_PRICE)
const SETUP = formatPeso(SETUP_FEE_WAIVED)
const DAILY = `₱${FUNNEL_DAILY_PRICE}`

export const NAV_ITEMS = [
  { href: '#system', label: 'How It Works' },
  { href: '#proof', label: 'Real Proof' },
  { href: '#faq', label: 'FAQ' },
] as const

export const HERO = {
  callout: 'Para sa food business owners na gusto ng mas maraming customers at repeat orders:',
  title: 'More Regulars. Bigger Orders. Kahit Busy Ka.',
  subtitle: `SmartMenu Growth System helps you get more customers ordering, turn first-time buyers into regulars, at palakihin ang bawat order through automatic upsells and loyalty. ${PRICE}/month. 0% commission. Cancel anytime.`,
  galleryHeadline: 'From first order hanggang maging regular, may system ka sa bawat step.',
  trustPill: '100+ food businesses already onboarded',
  trustPillShort: '100+ businesses onboarded',
  demoLabel: 'See SmartMenu in action',
  mathTitle: `${DAILY} a day para sa growth system mo`,
  mathBody: `${PRICE} a month is about ${DAILY} a day. Kung isang extra drink o side lang ang maidagdag ng automatic upsells sa isang araw, bawi na ang daily cost ng system.`,
} as const

export const PLAN = {
  badges: ['MORE REPEAT ORDERS', 'BIGGER ORDERS'],
  priceUnit: '/month',
  anchorNote: `${SETUP} setup`,
  saveBadge: 'FREE SETUP',
  includes: [
    'Your own ordering link para mas madaling umorder anytime, plus 0% commission',
    'Automatic upsells and combos para mas malaki ang bawat order',
    'Digital stamp card para may dahilan ang customers na bumalik',
    'SMS follow-ups para ma-reach mo ulit ang past customers',
    'Merchant app + POS + inventory para organized ang orders at operations',
    'Sales analytics + AI Growth Coach para alam mo kung ano ang next move',
  ],
  requirement:
    'After payment, sasagutan mo lang ang short setup form (around 5 minutes sa phone): logo, menu photos or typed menu, 3 best sellers, opening hours, order types at payment methods. Tapos kami na sa rest.',
} as const

export const BONUS = {
  divider: 'ANG MAGANDA PA DITO',
  title: 'Done-For-You Setup: Kami Na Ang Magbu-build',
  valueNote: `normally ${SETUP}`,
  freeTag: 'FREE WITH THIS OFFER',
  body: 'Hindi mo kailangang pag-aralan ang setup o mag-upload ng lahat isa-isa. Kami ang mag-aayos ng menu, branding, combos, automatic upsells, stamp card at payment setup para ready ka nang gamitin.',
} as const

export const CTA = {
  primary: "Oo, i-setup n'yo na ako",
  short: 'Claim my setup slot',
  withPrice: `Start for ${PRICE}/month`,
  reassurance: 'Month to month lang. Walang lock-in, at puwede kang mag-cancel anytime.',
  scarcity: 'Limited ang setup slots bawat week, kasi ang team namin ang nagse-set up at nagche-check ng bawat store bago ito mag-live.',
} as const

export const PAYMENT_NOTE = {
  lead: 'Pay with',
  joiner: ' or ',
  methods: ['GCash', 'BPI'],
  points: ['Secure checkout', 'No commission, ever'],
} as const

export const GUARANTEE = {
  title: 'Live in 48 Hours, or Your First Month Is Free',
  body: 'Pag natanggap na namin ang menu at logo mo, kami na ang bahala sa build. Kapag hindi live ang SmartMenu mo within 48 hours, libre ang first month mo.',
} as const

export const HERO_DETAILS = [
  {
    title: 'Ano exactly ang makukuha ko?',
    body: 'Makukuha mo ang buong SmartMenu Growth System: your own ordering link, QR ordering, automatic upsells, combos, digital stamp card, SMS, merchant app, POS, inventory, analytics at AI Growth Coach.',
  },
  {
    title: 'Paano nito gagawing bigger ang orders?',
    body: 'Habang umo-order ang customer, automatic silang makakakita ng relevant add-ons at upgrades, like "add fries?" or "make it a meal?" Kaya hindi na nakaasa sa staff memory ang upsell.',
  },
  {
    title: 'Paano nito gagawing regulars ang customers?',
    body: 'Every order can earn a digital stamp, tapos may sarili kang customer list at SMS tools. Kaya may way kang bigyan sila ng reason na bumalik, instead na mawala after one order.',
  },
  {
    title: 'Ano lang ang kailangan kong ibigay?',
    body: 'Logo, menu photos or typed menu, 3 best sellers, opening hours, order types at payment methods. Around 5 minutes lang ang setup form. Kami na ang magbu-build ng rest.',
  },
  {
    title: 'Kailangan ba nilang mag-download ng app?',
    body: 'Hindi. I-click lang nila ang link o i-scan ang QR, tapos makaka-order na sila sa phone browser. Mas simple para sa customer, mas madaling magsimula.',
  },
] as const

export const HOOK = {
  eyebrow: "Pero eto 'yung problema…",
  questions: [
    "Araw-araw ka bang naghahanap ng bagong customers, pero bihira mong ma-reach ulit 'yung mga bumili na?",
    'May orders bang lumalabas na main item lang, kahit puwede sanang may drink, side o meal upgrade?',
    'May customer bang natuwa sa food mo, pero after niyang umorder, wala ka nang way para bigyan siya ng reason na bumalik?',
  ],
  agitate: [
    'Mahirap kumuha ng bagong customer. Kailangan ka muna nilang makita, mapansin at pagkatiwalaan bago sila bumili. Pero after that first order, madalas parang balik ka ulit sa zero.',
    'Tapos habang busy ang store, may orders na lumalabas nang walang add-on. At \'yung customers na puwedeng maging regulars, nawawala lang kasi walang system para i-follow up sila.',
  ],
} as const

export const PROBLEM = {
  eyebrow: 'Hindi lang customers ang kulang',
  title: 'Three Leaks Keep You Chasing New Customers Every Day',
  intro:
    'Sa totoo lang, puwedeng may demand na ang food mo. Pero kung walang system after the first order, lagi kang naghahabol ng bagong buyer habang may repeat orders at bigger orders na naiiwan sa mesa.',
  leaks: [
    {
      title: 'Leak #1: New Customers Lang Lagi',
      body: "Every day, kailangan mong mag-post, mag-reply at maghanap ng bagong tao. Mahirap 'yun, kasi mas challenging mag-convert ng stranger kaysa mag-invite ulit ng customer na bumili na sa'yo.",
    },
    {
      title: 'Leak #2: Small Orders Stay Small',
      body: "Kapag walang automatic offer, madaling matapos ang order sa isang item lang. Sayang 'yung drink, side, dessert o meal upgrade na puwede sanang idagdag.",
    },
    {
      title: 'Leak #3: One-and-Done Customers',
      body: 'Bumili sila once, tapos na. Walang name, walang number, walang stamp, walang follow-up. Kahit nagustuhan nila ang food mo, wala kang system para tulungan silang maging regulars.',
    },
  ],
  bigLieTitle: '"Kailangan ko lang ng mas maraming bagong customers."',
  bigLie: [
    'More customers help, syempre. Pero kung bawat bagong customer ay one-and-done lang, tuloy-tuloy ka ring babalik sa paghahanap ng bagong tao.',
    "Hindi mo kasalanan 'yan. Wala lang talagang nagbigay sa'yo ng system that helps customers order easily, spend a little more, at magkaroon ng dahilan para bumalik.",
  ],
} as const

export const STORY = {
  eyebrow: 'Doon namin napansin ang pattern',
  title: 'The Orders Came In. Then What?',
  paragraphs: [
    "May order na papasok sa Facebook Messenger ng owner. Good news: gumagana 'yung online menu na ginawa namin, at mas madali nang maka-order ang customer. Pero habang dumarami ang stores na sine-set up namin, may isang bagay na hindi namin ma-ignore.",
    "After working with 100+ food businesses, paulit-ulit naming nakita ang same pattern. The stores that grew weren't always the ones with the best food. May iba na masarap din naman, pero parang laging balik sa paghahanap ng next new customer.",
    'Doon namin na-gets kung ano ang difference. Sa businesses na may better system, madaling umorder ang customer, may chance siyang makakita ng add-on, at after the sale hindi siya basta nawawala. May name at number ang owner para ma-invite siyang bumalik.',
    "At hindi dahil tamad ang ibang owners. Busy lang talaga, at walang nagbigay sa kanila ng tools para gawin lahat 'yon consistently. So we put ordering, automatic upsells and bringing customers back into one simple system na puwedeng i-run from your phone.",
    'Developers kami, hindi cooks, kaya ayaw naming dagdagan pa ang trabaho ng owner. Kami na ang nagse-set up para ready itong gamitin. Kasi in the end, simple lang ang natutunan namin:',
  ],
} as const

export const BIG_DOMINO = {
  eyebrow: 'Ito ang bagong way to grow',
  statement: 'More growth happens when one system turns new buyers into bigger orders and repeat customers.',
  bridge:
    'Kasi hindi sapat na makakuha lang ng first order. Ang goal ay gawing mas easy ang next order, mas valuable ang bawat basket, at mas likely silang bumalik.',
} as const

export const SECRETS = {
  eyebrow: 'So paano mo aayusin ang three leaks?',
  title: 'Three Simple Shifts Para Mas Maraming Orders, Bigger Baskets at More Regulars',
  subtitle:
    'Hindi mo kailangang baguhin ang buong business mo. Kailangan mo lang ng system na tumutulong sa customer umorder, gumastos nang kaunti pa, at bumalik ulit.',
  items: [
    {
      label: 'Secret #1',
      title: 'Paano Mas Maraming Customers ang Maka-order Kahit Sanay Sila sa Messenger',
      belief: "\"Hindi naman mahilig mag-online order ang customers ko. Okay na 'yung Messenger.\"",
      paragraphs: [
        'Messenger works, lalo na kung doon ka sanay. Pero kapag kailangan pang magtanong ng menu, maghintay ng reply, mag-type ng order at mag-confirm isa-isa, may extra friction bago pa makabili ang customer.',
        'Kaya mas simple kung may sarili kang ordering link na puwede nilang buksan anytime. Makikita na nila ang menu, photos at checkout in one place. At bonus lang: 0% commission ang orders na dumadaan sa sarili mong SmartMenu.',
      ],
      outcome: 'Mas easy para sa customers na umorder kapag ready na sila, galing man sa Facebook, Instagram, Messenger o QR sa table.',
      tools: [
        {
          title: 'Your Own Ordering Link',
          body: 'Isang direct link na may full menu, photos at checkout, para wala nang mahabang back-and-forth bago maka-order.',
        },
        {
          title: 'QR Ordering + Pick-Up + Delivery',
          body: 'Puwedeng mag-scan sa table for dine-in, o gamitin ang same ordering system para sa pick-up at delivery.',
        },
        {
          title: 'Merchant App + POS',
          body: 'New orders ring sa Android o iPhone merchant app mo, habang may POS ka rin para organized ang walk-in orders.',
        },
      ],
      trialClose: 'Mas madaling bumili kapag less hassle ang ordering, diba?',
    },
    {
      label: 'Secret #2',
      title: 'Paano Gumawa ng Bigger Orders Kahit Busy Ka at Hindi Ka Techy',
      belief: '"Hindi ako techy, wala akong time mag-set up, at makakalimutan din ng staff ang upsell."',
      paragraphs: [
        'Totoo naman: kapag rush hour, hindi realistic umasa na maaalala ng staff ang perfect add-on sa bawat order. May customer na bibili ng burger, pero walang makakapagtanong kung gusto niyang gawing meal.',
        'Kaya ang better way ay ilagay mismo ang automatic upsells sa ordering flow. Tapos para hindi ka rin ma-stress sa tech, done-for-you ang setup. Kami ang mag-aayos ng menu, branding, combos, upsells, stamp card at payments.',
      ],
      outcome: 'Mas may chance maging bigger ang bawat order, without adding another task sa staff mo.',
      tools: [
        {
          title: 'Automatic Upsells at 3 Key Moments',
          body: 'May offer after adding an item, sa item page, at bago mag-checkout, kaya hindi nakadepende sa memory ng staff.',
        },
        {
          title: 'Combo Builder + Savings Badge',
          body: 'I-package ang items into combos at ipakita ang savings, para mas clear kung bakit magandang mag-upgrade.',
        },
        {
          title: 'Done-For-You Setup',
          body: 'Ibigay mo lang ang store details mo, then kami na ang magse-set up ng system para ready mo nang gamitin.',
        },
      ],
      trialClose: "Kung system na ang nagre-remind sa customer mag-add, mas consistent 'yun, tama?",
    },
    {
      label: 'Secret #3',
      title: 'Paano Magpabalik ng Customers Kahit Wala Kang Big Marketing Budget',
      belief: '"Kapag bumili na sila, bahala na kung babalik. Kailangan ko siguro ng mas maraming ads."',
      paragraphs: [
        "Ads can help you reach new people. Pero may isang group na mas madaling kausapin: 'yung customers na bumili na sa'yo at alam na kung gaano kasarap ang food mo.",
        'Ang problema, kung wala kang customer list, loyalty at follow-up, nawawala sila after checkout. Kaya SmartMenu helps you keep the relationship going through stamps, customer data at SMS.',
      ],
      outcome: 'Instead na puro strangers ang hinahabol mo, may system kang tumutulong gawing regulars ang past customers.',
      tools: [
        {
          title: 'Digital Stamp Card',
          body: 'Every order can earn a stamp, at puwedeng i-save ng customer sa Apple Wallet o Google Wallet para visible ang progress nila.',
        },
        {
          title: 'SMS to Past Customers',
          body: 'Send promos, new dish announcements o simpleng "we miss you" messages para may reason silang bumalik.',
        },
        {
          title: 'Your Own Customer List',
          body: "Makikita mo kung sino ang umo-order, gaano kadalas sila bumalik at magkano ang ginagastos nila. At sa'yo ang customer data.",
        },
      ],
      trialClose: 'Mas madaling mag-grow kapag hindi ka balik sa zero after every order, diba?',
    },
  ],
  brainTitle: 'Tapos May Data Ka, Para Hindi Puro Hula ang Next Move',
  brainBody:
    'Habang ginagamit mo ang system, makikita mo sa sales analytics kung ano ang mabenta at ano ang mabagal. Tapos ang AI Growth Coach can suggest kung anong combo o offer ang puwede mong subukan next.',
  productAlt: 'SmartMenu ordering website and merchant app: online ordering, automatic upsells, loyalty, orders and sales tools',
} as const

export const PROOF = {
  eyebrow: 'At bago ka mag-decide, tingnan mo muna',
  title: 'See the System in Action, Hindi Lang Puro Claims',
  subtitle:
    'May actual product demo, merchant video testimonial at real feedback, para makita mo kung paano ginagamit ang SmartMenu sa totoong food business.',
  demoTitle: 'Watch how a customer goes from menu to order',
  videoLabel: 'Merchant video testimonial',
  messageAlt: 'Screenshot of a real merchant message praising the hero banner of their SmartMenu store',
  reviewAlt: 'Real Facebook recommendation from a SmartMenu merchant',
  statLabels: ['Food businesses onboarded', 'To go live after menu + logo', 'Commission on your own orders', 'Approximate daily cost'],
  disclaimer:
    'Results will vary depende sa menu mo, effort mo at kung paano mo ginagamit ang system. Hindi kami nagpo-promise ng specific sales increase.',
  trialClose: 'Gusto mo bang ikaw naman ang next?',
} as const

export const STACK = {
  eyebrow: "Okay, ipapakita ko na sa'yo lahat",
  title: 'Everything You Need to Turn More Buyers Into Bigger Orders and Regulars',
  transition:
    'Kapag pinagsama mo lahat, hindi na lang ito ordering tool. May system ka from first click hanggang repeat order.',
  anchorTitle: 'Pero magkano ang nawawala kapag walang system?',
  anchorBody:
    "Halimbawa lang: kung may 30 orders ka a day, at every 3rd order sana ay puwedeng kumuha ng ₱50 add-on, that's 10 extra add-ons, or ₱500 a day. Around ₱15,000 a month ang puwedeng maiwan sa mesa. Tapos hindi pa kasama doon 'yung past customers na puwedeng naging regulars pero hindi na na-follow up.",
  ifAll: [
    `Kung ang ginawa lang nito ay gawing mas easy para sa customers na umorder anytime, sulit na ba ang ${PRICE}?`,
    `Kung ang ginawa lang nito ay mag-offer ng automatic add-ons at upgrades para sa bigger orders, sulit na ba ang ${PRICE}?`,
    `Kung ang ginawa lang nito ay tulungan kang gawing regulars ang past customers, sulit na ba ang ${PRICE}?`,
  ],
  valueHeader: 'Value',
  totalLabel: 'Total stack value',
  reveal: `Pero hindi mo babayaran ang ${formatPeso(stackTotalValue())}. At hindi mo rin babayaran ang ${SETUP} na done-for-you setup.`,
  todayLabel: 'Get the SmartMenu Growth System for',
  daily: `${PRICE}/month lang, about ${DAILY} a day.`,
  valueNote:
    'Ang individual values ay estimates namin kung magkano ang puwedeng cost kapag hiwa-hiwalay mong kukunin o ipa-build ang bawat piece.',
} as const

export const GUARANTEE_SECTION = {
  eyebrow: 'Kami ang magse-set up, kaya kami rin ang sasalo ng risk',
  title: 'Try the System Without Getting Locked In',
  paragraphs: [
    'Hindi mo kailangang bumili tapos ikaw pa ang mag-figure out ng tech. Ibigay mo lang ang menu, logo at basic store details, then kami ang magbu-build ng SmartMenu mo.',
    'Pag natanggap na namin ang menu at logo mo, live ka within 48 hours, or libre ang first month. Tapos month to month lang, kaya makikita mo muna kung fit talaga siya sa business mo.',
  ],
  points: [
    'Live in 48 hours after we receive your menu and logo, or your first month is free',
    'No contract, no lock-in. Cancel anytime.',
    'Your customer list stays yours',
  ],
} as const

export const TIMELINE = {
  imagineTitle: 'Imagine this Friday night…',
  imagine:
    "Sunod-sunod ang orders na pumapasok sa phone mo through your own ordering link. May customers na nag-a-add ng drink, side o meal upgrade dahil nakita nila ang automatic upsell. May regulars na nagco-collect ng stamps para bumalik ulit. At habang busy ang store, may system na tumutulong sa'yo kumuha ng orders, palakihin sila, at keep the customer relationship going.",
  title: 'From Setup to Repeat Orders, Ganito ang Flow',
  subtitle:
    'Simple lang ang process. Hindi mo kailangang i-build lahat yourself. Ibigay mo ang basics, then kami ang magse-set up para makapagsimula ka agad.',
  steps: [
    {
      when: 'Ngayon',
      title: 'Claim your setup slot',
      body: 'Complete the payment, then sagutan ang short setup form (around 5 minutes lang sa phone). Ibigay mo ang logo, menu, 3 best sellers, opening hours, order types at payment methods.',
    },
    {
      when: 'Within 48 hours',
      title: 'Your SmartMenu goes live',
      body: 'Pag natanggap namin ang menu at logo mo, kami ang magse-set up ng store, branding, combos at automatic upsells. Pag ready na, i-post mo na ang ordering link at ilagay ang QR sa tables.',
    },
    {
      when: 'Week 1',
      title: 'Customers start ordering through the system',
      body: 'Habang umo-order sila, nakakakita sila ng relevant add-ons at upgrades. Tapos kapag may bagong order, magri-ring sa merchant app mo para mas organized ang pag-handle.',
    },
    {
      when: 'Month 1',
      title: 'Your customer list starts growing',
      body: 'Habang may pumapasok na orders, nabubuo rin ang sarili mong customer list. Customers collect stamps, at puwede ka nang mag-send ng SMS promo para bigyan sila ng reason na bumalik.',
    },
    {
      when: 'Month 3 pataas',
      title: 'You start seeing what actually works',
      body: 'Mas makikita mo na kung ano ang best sellers, sino ang regulars at anong offers ang ginagamit. Kaya mas informed ang next combo, promo o growth move mo.',
    },
  ],
} as const

export const FIT = {
  title: 'Is SmartMenu a Fit for Your Business?',
  subtitle:
    "Hindi ito para sa lahat. Pero kung gusto mo ng better system for orders and repeat customers, malamang swak ito sa'yo.",
  forYouTitle: "PARA SA'YO ITO KUNG…",
  forYou: [
    'May restaurant, café, milk tea shop, carinderia, food stall o cloud kitchen ka',
    'Gusto mo ng more repeat customers, hindi puro first-time buyers',
    'Gusto mo ng more orders without always spending more on ads',
    'Tumatanggap ka ng orders through chat at gusto mo ng mas organized na ordering flow',
    'Gusto mong malaman kung ano ang mabenta, ano ang slow at sino ang bumabalik',
    "May phone ka at Facebook page. Sapat na 'yon para makapagsimula",
  ],
  notForYouTitle: "HINDI ITO PARA SA'YO KUNG…",
  notForYou: [
    'Wala ka pang menu o hindi ka pa actively selling',
    'Ayaw mong i-share ang sarili mong ordering link sa customers',
    'Free DIY tool lang ang gusto mo at mas gusto mong ikaw ang mag-set up ng lahat',
  ],
  note: "Walang lock-in. Try it for a month, see how it fits your business, then cancel anytime kung hindi para sa'yo.",
} as const

export const CLOSE = {
  eyebrow: 'Sa dulo, dalawa lang talaga ang direction',
  title: 'Dalawa lang ang choice mo.',
  stay: {
    label: 'Option 1: Keep doing it the same way',
    points: [
      'Maghanap ulit ng bagong customers araw-araw',
      'Hayaan ang small orders na lumabas nang walang add-on offer',
      'Umasa na lang na kusang babalik ang one-and-done buyers',
    ],
  },
  switch: {
    label: 'Option 2: Build a growth system',
    points: [
      'Make it easier for more customers to order through your own link',
      'Use automatic upsells para maging bigger ang bawat order',
      'Build your customer list, reward regulars at bigyan sila ng reason na bumalik',
    ],
  },
  body: `For ${PRICE}/month, may system ka na designed around more orders, bigger orders and more repeat customers, at kami pa ang magse-set up nito para sa'yo. Limited ang setup slots bawat week, kasi ang team namin ang nagse-set up at nagche-check ng bawat store bago ito mag-live.`,
} as const

export const ORDER = {
  eyebrow: 'Ready to build your growth system?',
  title: 'Claim Your SmartMenu Setup Slot',
  subtitle:
    'Pag-submit mo ng form, makikita mo agad ang reference number at GCash/BPI payment instructions. Once paid, matatanggap mo ang 5-minute setup form at sisimulan na naming buuin ang SmartMenu mo.',
  summaryTitle: 'Order summary',
  firstMonth: 'First month',
  setupLine: 'Done-for-you setup',
  dueToday: 'Due today',
  renewalNote: `Renews at ${PRICE}/month. Walang lock-in, cancel anytime.`,
  submit: 'Claim my setup slot',
  submitting: 'Saving your setup slot…',
} as const

export const ORDER_FORM = {
  fields: {
    name: { label: 'Your name', placeholder: 'Juan dela Cruz', error: 'Ilagay ang full name mo.' },
    businessName: {
      label: 'Restaurant / business name',
      placeholder: "Juan's Kitchen",
      error: 'Ilagay ang pangalan ng business mo.',
    },
    phone: {
      label: 'Mobile number',
      placeholder: '09171234567',
      error: 'Maglagay ng valid 11-digit mobile number, example: 09171234567.',
    },
    email: { label: 'Email address', placeholder: 'juan@email.com', error: 'Maglagay ng valid email address.' },
  },
  paymentLegend: 'How would you like to pay?',
  paymentLoading: 'Loading payment options…',
  paymentLoadError: 'Hindi ma-load ang payment options. I-refresh ang page then try again.',
  paymentRequired: 'Pili muna kung paano mo gustong magbayad.',
  saveFailed: 'Hindi na-save ang details mo. Please try again.',
  connectionFailed: 'May connection problem. Check your internet then try again.',
} as const

export const FAQ = {
  title: 'Baka Ito Rin ang Tanong Mo',
  items: [
    {
      q: 'May commission ba bawat order?',
      a: 'Wala po. Orders that go through your own SmartMenu have 0% commission. Flat monthly fee lang ang binabayaran mo.',
    },
    {
      q: 'May setup fee ba?',
      a: `Normally may ${SETUP} done-for-you setup fee, pero FREE po siya with this offer.`,
    },
    {
      q: 'May contract o lock-in ba?',
      a: 'Wala po. Month to month lang ang SmartMenu, at puwede kang mag-cancel anytime.',
    },
    {
      q: 'Kailangan ko bang maging techy?',
      a: 'Hindi po. Ibigay mo lang ang basic business details, then kami na ang magse-set up ng menu, branding, combos, automatic upsells, stamp card at payments.',
    },
    {
      q: 'Gaano kabilis magiging live?',
      a: 'Within 48 hours po after namin matanggap ang menu at logo mo. Kapag hindi namin nagawa, libre ang first month mo.',
    },
    {
      q: 'Paano ko matatanggap ang orders?',
      a: 'New orders ring sa merchant app mo sa Android o iPhone. Makikita mo rin sila sa web dashboard, at puwede ring pumasok sa Messenger kung gusto mo.',
    },
    {
      q: 'Nasa Grab o Foodpanda na ako. Kailangan ko pa ba nito?',
      a: 'Puwede mo silang gamitin side by side. Grab at Foodpanda help with discovery, habang ang SmartMenu gives your regular customers a direct way to order through your own link, with 0% commission.',
    },
    {
      q: 'Gagana ba ito sa café, milk tea o carinderia?',
      a: 'Oo po. SmartMenu supports dine-in QR ordering, pick-up at delivery, kaya puwede sa restaurants, cafés, milk tea shops, carinderias, food stalls at cloud kitchens.',
    },
    {
      q: 'Puwede ba akong gumamit ng sariling domain?',
      a: 'Oo po. Start ka sa yourbrand.webnegosyo.com, then connect your own domain anytime.',
    },
    {
      q: 'Paano ako magbabayad?',
      a: 'GCash o BPI po. Pag-submit mo ng form, makikita mo ang reference number at complete payment instructions.',
    },
  ],
} as const

export const POSTSCRIPT = {
  ps: `Kung nag-skip ka diretso sa bottom, eto ang short version: SmartMenu Growth System makes it easier for more customers to order, creates bigger orders through automatic upsells, at turns past buyers into regulars through loyalty, SMS and your own customer list. ${PRICE}/month. Done-for-you setup. Live in 48 hours after we receive your menu and logo, or your first month is free. No contract.`,
  pps: 'Limited ang setup slots bawat week, kasi ang team namin ang nagse-set up at nagche-check ng bawat store bago ito mag-live. Kapag puno na ang slots, kailangan munang maghintay sa next opening.',
} as const

export const FOOTER = {
  blurb:
    'SmartMenu by WebNegosyo: the growth system for Philippine restaurants and food businesses that want more orders, bigger baskets and more customers coming back.',
  links: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/support', label: 'Support' },
  ],
} as const

export const GALLERY = {
  label: 'SmartMenu photos',
  slide: (index: number, total: number) => `${index} of ${total}`,
  thumbnail: (index: number, alt: string) => `Photo ${index}: ${alt}`,
  next: 'Next photo',
  previous: 'Previous photo',
} as const

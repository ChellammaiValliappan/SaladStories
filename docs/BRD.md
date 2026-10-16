SALAD STORIES  |  MASTER BRD

**SALAD STORIES**

Master Business Requirements Document

Online Salad Ordering and Delivery Platform

Content included exactly through Section 10.1, based on the text supplied in this request.

# 1. PROJECT OVERVIEW

## 1.1 Project Name

Salad Stories — Online Salad Ordering and Delivery Platform

## 1.2 Business Overview

Salad Stories is a healthy food business specializing in protein-rich salads, nutritious bowls, fruit bowls, and convenient meal options for health-conscious customers.

The website must allow customers to browse the menu, customize their selections, add products to a shopping cart, apply discount coupons, enter delivery details, pay online using Razorpay, and receive order confirmations.

The business owner must receive real-time order notifications through WhatsApp and/or email and have access to an admin dashboard to manage menus, orders, payments, coupons, customers, and delivery operations.

## 1.3 Primary Objective

Build a fully functional, mobile-friendly, responsive e-commerce website for Salad Stories that supports the complete ordering lifecycle:

Customer visits website → Browses menu → Selects a salad → Customizes the item → Adds it to cart → Applies a coupon → Enters delivery information → Selects delivery slot → Completes payment → Receives order confirmation → Business owner receives order notification → Order is prepared and dispatched → Customer receives status updates → Order is delivered.

The website must be production-ready, secure, scalable, and easy for the business owner to manage without requiring technical knowledge.

## 1.4 Target Customers

Health-conscious individuals.

Fitness enthusiasts and gym-goers.

Customers looking for protein-rich meals.

Customers looking for convenient vegetarian meals.

Customers looking for non-vegetarian protein options.

Customers who want healthy lunch, afternoon, or dinner deliveries.

## 1.5 Initial Delivery Areas

Configure the following as the initial service areas:

Taramani.

Perungudi.

Thoraipakkam.

The administrator must be able to add, edit, disable, or remove delivery areas from the dashboard.

Do not allow customers to place delivery orders outside the configured service areas unless the administrator enables additional locations.

# 2. WEBSITE STRUCTURE

Create the following pages and functional modules.

Home page.

Menu page.

Product details page.

Shopping cart.

Checkout page.

Payment processing page.

Order confirmation page.

Order tracking page.

Customer login and registration.

Customer profile and address management.

My Orders page.

About Salad Stories.

Contact Us.

Frequently Asked Questions.

Delivery Policy.

Cancellation and Refund Policy.

Privacy Policy.

Terms and Conditions.

Admin login.

Admin dashboard.

Menu management.

Order management.

Coupon management.

Customer management.

Delivery management.

Payment and transaction management.

Sales reports and analytics.

All pages must be responsive and optimized for Android phones, iPhones, tablets, laptops, and desktops.

Prioritize the mobile shopping experience because customers are likely to order through their phones.

# 3. BRANDING AND USER INTERFACE

## 3.1 Brand Name

Salad Stories

## 3.2 Design Direction

Create a modern, fresh, premium-looking healthy food website.

The website should communicate:

Freshness.

Nutrition.

Protein-rich meals.

Health and wellness.

Trust.

Convenience.

Affordable healthy eating.

Use a clean layout with attractive food photography, readable typography, and a simple navigation structure.

Suggested visual direction:

Natural green.

White or cream.

Warm beige.

Subtle earthy accents.

Use consistent colors, buttons, spacing, icons, and typography across all pages.

## 3.3 Homepage Design

The homepage must contain:

### Section 1: Header

Display:

Salad Stories logo.

Home.

Menu.

About Us.

Contact Us.

Cart icon with item count.

Login/Profile icon.

Display the delivery location selector prominently.

### Section 2: Hero Banner

**Headline:** "Fresh Bowls. High Protein. Better You."

**Supporting text:** "Discover delicious, protein-focused salads made for your everyday health goals."

**Primary button:** "Explore Our Menu"

**Secondary button:** "Order Now"

Use an attractive image of fresh salad bowls.

### Section 3: Featured Menu

Display the five primary menu categories:

High Protein Non-Veg Salad.

High Protein Paneer Bowl.

Hair Fall Control Bowl.

Fruits Bowl.

Egg Crunch Salad.

Each product card must display:

Product image.

Product name.

Short description.

Price in INR.

Vegetarian or non-vegetarian label.

Protein information, when verified.

Availability status.

Add to Cart button.

View Details button.

### Section 4: Why Choose Salad Stories?

Display benefits such as:

Protein-focused food choices.

Freshly prepared meals.

Convenient doorstep delivery.

Vegetarian and non-vegetarian options.

Transparent nutritional information.

Only display claims that the business can substantiate.

### Section 5: How It Works

Show four simple steps:

Choose your bowl.

Customize your meal.

Pay securely online.

Enjoy doorstep delivery.

### Section 6: Customer Reviews

Allow the business owner to publish genuine customer reviews and testimonials. Do not create fake customer reviews or fabricated ratings.

### Section 7: Footer

Include:

Contact information.

Business email.

WhatsApp contact button.

Delivery areas.

Terms and conditions.

Privacy policy.

Refund policy.

Social media links.

All contact information must be configurable from the admin dashboard.

# 4. MENU AND PRODUCT MANAGEMENT

## 4.1 Initial Products

### Product 1: High Protein Non-Veg Salad

**Description:** A protein-focused salad bowl featuring chicken and fresh vegetables.

Possible configurable ingredients:

Chicken.

Lettuce or other leafy vegetables.

Cucumber.

Tomato.

Onion.

Carrot.

Optional dressing.

Optional seasoning.

The final ingredient list, portion sizes, nutritional values, and price must be configurable by the administrator.

### Product 2: High Protein Paneer Bowl

**Description:** A vegetarian protein-focused bowl featuring paneer and fresh vegetables.

Possible configurable ingredients:

Paneer.

Cucumber.

Tomato.

Carrot.

Onion.

Leafy vegetables.

Optional dressing.

Optional seasoning.

### Product 3: Hair Fall Control Bowl

**Description:** A nutrient-focused bowl designed around ingredients commonly associated with a balanced diet and healthy hair nutrition.

The website must not claim that this product prevents, treats, or reverses hair loss.

Possible configurable ingredients:

Fruits.

Seeds.

Nuts.

Vegetables.

Other ingredients selected by the business owner.

The owner must be able to define the final recipe, serving size, allergen information, nutritional values, and price.

### Product 4: Fruits Bowl

**Description:** A refreshing bowl of freshly prepared seasonal fruits.

Possible configurable ingredients:

Apple.

Banana.

Papaya.

Watermelon.

Orange.

Other seasonal fruits.

Allow the administrator to configure ingredient availability based on season and stock.

### Product 5: Egg Crunch Salad

**Description:** A satisfying salad featuring eggs, fresh vegetables, and optional crunchy toppings.

Possible configurable ingredients:

Boiled eggs.

Cucumber.

Tomato.

Carrot.

Leafy vegetables.

Optional crunchy toppings.

Optional dressing.

The administrator must define the final recipe and portion sizes.

**Important:** The ingredient lists above are configurable suggestions, not fixed recipes. The administrator must be able to edit every product before publishing it.

## 4.2 Product Information Fields

Every product must support:

Product ID.

Product name.

Product slug.

Product description.

Product image.

Additional product images.

Base price.

Discounted price, if applicable.

Food category.

Vegetarian/non-vegetarian classification.

Ingredient list.

Portion size.

Serving information.

Protein per serving.

Calories per serving.

Carbohydrates.

Fat.

Fibre.

Allergen information.

Preparation time.

Availability.

Stock status.

Customization options.

Display order.

Featured product flag.

Product status: Draft, Published, Unavailable.

Nutritional information must be based on verified recipe calculations or reliable nutritional analysis. Do not fabricate nutritional values.

## 4.3 Product Availability

The administrator must be able to:

Mark a product as available.

Mark a product as sold out.

Temporarily disable a product.

Change the price.

Update ingredients.

Update photographs.

Change nutritional information.

Set daily availability.

Configure maximum order quantities, where necessary.

When a product is unavailable, customers must not be able to add it to the cart or proceed to checkout with that unavailable item.

If a product becomes unavailable after it has been added to a cart, inform the customer and require them to remove or replace it before checkout.

# 5. PRODUCT CUSTOMIZATION

Build a flexible product customization system.

The administrator must be able to configure the customization options available for each product.

Possible options include:

Portion size.

Protein quantity.

Dressing selection.

Spice level.

Add-on ingredients.

Removal of optional ingredients.

Crunchy toppings.

Extra egg.

Extra chicken.

Extra paneer.

These are examples. Only enable options supported by the actual kitchen and menu.

## 5.1 Customization Rules

Each customization option must support:

Option name.

Option type.

Available choices.

Whether selection is mandatory.

Minimum selections.

Maximum selections.

Additional price per selection.

Default selection, if applicable.

Availability status.

Support the following option types:

Single selection.

Multiple selection.

Yes/No selection.

Quantity selection.

Optional add-on.

Ingredient removal.

## 5.2 Example Combinations

Example A: High Protein Non-Veg Salad

Regular portion.

Standard chicken portion.

No additional dressing.

One extra egg.

Example B: High Protein Paneer Bowl

Large portion.

Extra paneer.

No onion.

Dressing selected.

Example C: Egg Crunch Salad

Regular portion.

Two additional toppings.

One extra egg.

The prices must update automatically whenever a paid customization is selected or removed.

The customer must see the final price before adding the product to the cart.

Prevent invalid selections when minimum or maximum selection rules apply.

# 6. SHOPPING CART

Build a fully functional shopping cart.

## 6.1 Cart Requirements

Customers must be able to:

Add products to the cart.

Add multiple different products.

Add the same product more than once.

Increase quantity.

Decrease quantity.

Remove an item.

Edit product customizations.

View the product image.

View the product name.

View selected ingredients and customizations.

View quantity.

View unit price.

View line-item total.

View subtotal.

Apply a coupon.

Remove a coupon.

View the discount amount.

View delivery charges.

View applicable taxes or other disclosed charges.

View the final payable amount.

## 6.2 Cart Calculation

Line Item Total = Quantity × Customized Unit Price

Subtotal = Sum of All Line Item Totals

Discount = Valid Coupon Discount

Tax = Applicable Tax Calculated According to Configured Tax Rules

Delivery Fee = Delivery Fee Applicable to the Order

Final Payable Amount = Subtotal - Discount + Tax + Delivery Fee

If any other fee is introduced, it must be disclosed before payment.

Do not charge an undisclosed fee.

Calculate the final payable amount on the server. Never rely exclusively on prices or discount values sent by the customer's browser.

## 6.3 Cart Persistence

If a customer refreshes the page, their cart should remain available.

For guest customers, preserve the cart using a suitable secure browser-side mechanism.

For logged-in customers, associate the cart with their account.

When a guest logs in, merge the guest cart with the account cart carefully.

Prevent duplicate or invalid items during cart merging.

If prices, products, or availability have changed, notify the customer and recalculate the cart before checkout.

# 7. COUPON AND DISCOUNT MANAGEMENT

Create a complete coupon management module.

## 7.1 Coupon Types

Support:

Percentage discount.

Fixed amount discount.

Free delivery.

Minimum-order-based discount.

Product-specific discount.

Category-specific discount.

First-order discount.

Limited-use coupon.

Date-limited promotional coupon.

Campaign-specific coupon.

The administrator must be able to enable or disable each supported coupon type.

## 7.2 Coupon Configuration

Each coupon must have:

Coupon ID.

Coupon code.

Coupon description.

Discount type.

Discount value.

Maximum discount amount.

Minimum eligible order value.

Start date.

Expiry date.

Total redemption limit.

Per-customer redemption limit.

Eligible products.

Eligible categories.

Eligible customer types.

Applicable delivery areas, if needed.

Whether it can be combined with other offers.

Active/inactive status.

## 7.3 Coupon Validation

When the customer enters a coupon code, validate:

Whether the coupon exists.

Whether the coupon is active.

Whether the coupon has expired.

Whether the start date has been reached.

Whether the minimum order amount is satisfied.

Whether the selected products are eligible.

Whether the customer has already used the coupon.

Whether the total redemption limit has been reached.

Whether the coupon is valid for the delivery location.

Whether the coupon can be combined with existing discounts.

Display clear messages, such as:

"Coupon applied successfully!"

"This coupon has expired."

"Your order does not meet the minimum purchase requirement."

"This coupon is valid for first-time customers only."

"This coupon has reached its redemption limit."

"This coupon is not applicable to the selected items."

## 7.4 Coupon Calculation Rules

Define whether each coupon applies to:

The full product subtotal.

Selected eligible products.

Selected eligible categories.

Delivery charges.

The order before or after other discounts.

The default implementation must prevent discounts from exceeding the eligible amount.

For percentage discounts, enforce any configured maximum discount.

Do not allow the final payable amount to become negative.

Do not allow multiple coupons unless the administrator explicitly enables stacking.

## 7.5 Coupon Examples

Use these as test examples, not as mandatory live offers:

WELCOME10: 10% discount for eligible first orders.

HEALTH50: ₹50 off when the eligible subtotal reaches ₹500.

FREEDELIVERY: Waive eligible delivery charges.

The administrator must be able to modify or remove these examples before launch.

## 7.6 Coupon Redemption Integrity

Coupon redemption must be recorded against the order and customer.

A coupon must not be considered successfully redeemed simply because it was entered.

For prepaid orders, finalize redemption only after the payment is confirmed, while reserving limited-use coupons appropriately during checkout.

For failed payments, release temporary coupon reservations.

Use atomic or transactional validation to prevent concurrent orders from exceeding coupon usage limits.

# 8. DELIVERY LOCATION AND DELIVERY CHARGES

## 8.1 Delivery Address

The checkout page must collect:

Customer full name.

Mobile number.

Email address.

House or flat number.

Building or apartment name.

Street.

Area.

City.

State.

PIN code.

Landmark.

Delivery instructions.

Make only essential fields mandatory.

## 8.2 Delivery Area Validation

Initially configure:

Taramani.

Perungudi.

Thoraipakkam.

Validate the customer's PIN code or delivery area against the configured service-area database.

Do not rely only on free-text area names.

If the location is outside the delivery area, show:

"Sorry, Salad Stories is not delivering to this location yet."

Offer a way to contact the business or register interest in future delivery availability.

## 8.3 Delivery Charges

The administrator must be able to configure:

Flat delivery fee.

Area-based delivery fee.

Minimum order for free delivery.

Free delivery coupon eligibility.

Maximum delivery distance, if distance-based delivery is implemented.

Minimum order value.

Temporary delivery restrictions.

Display delivery charges before the customer proceeds to payment.

Revalidate the fee during checkout so that the customer cannot manipulate it.

## 8.4 Delivery Scheduling

Allow the administrator to configure available delivery dates and time slots.

The checkout must display only valid delivery slots.

Support:

Afternoon delivery.

Dinner delivery.

Additional slots configured by the owner.

Allow the owner to configure:

Start and end times.

Order cut-off time.

Maximum orders per slot.

Holidays.

Blackout dates.

Same-day ordering rules.

Advance-ordering rules.

Do not allow a customer to book a full or closed slot.

# 9. CUSTOMER ACCOUNT AND CHECKOUT

## 9.1 Customer Registration

Support guest checkout as the default low-friction option.

Also support optional account registration.

Possible login methods:

Mobile number with OTP, if an appropriate SMS authentication provider is configured.

Email and password.

Supported third-party login, if explicitly implemented.

Do not make customers register merely to place an order unless the business owner changes this rule.

## 9.2 Customer Profile

Logged-in customers should be able to:

View their profile.

Update contact details.

Save delivery addresses.

Edit saved addresses.

Delete saved addresses.

View order history.

Reorder previous purchases.

View order status.

View payment status.

View eligible coupons.

## 9.3 Checkout Workflow

The checkout page must contain:

Step 1: Contact Information.

Step 2: Delivery Address.

Step 3: Delivery Date and Time Slot.

Step 4: Order Summary.

Step 5: Coupon Code.

Step 6: Payment Method.

Step 7: Final Order Review.

Step 8: Place Order and Pay.

Before payment, display:

All products.

Customizations.

Quantities.

Subtotal.

Discount.

Delivery charges.

Taxes, if applicable.

Final payable amount.

Delivery address.

Delivery slot.

Cancellation and refund policy.

Require the customer to confirm the order before initiating payment.

Prevent duplicate submissions when the customer double-clicks the payment button or experiences a slow network.

# 10. RAZORPAY PAYMENT INTEGRATION

Integrate Razorpay using the official supported checkout flow and server-side APIs.

The payment integration must support the payment methods enabled for the merchant account.

Potential methods include:

UPI, including supported Google Pay transactions.

Credit cards.

Debit cards.

Net banking.

Eligible wallets.

Meal cards, only if supported and enabled for the merchant account and the applicable transaction.

**Important:** Do not assume every meal card or payment instrument is supported by every Razorpay configuration. Verify eligibility with Razorpay before enabling the corresponding option.

## 10.1 Payment Flow

Implement the following flow:

Customer completes checkout.

Server validates products, quantities, prices, coupons, delivery address, and total.

Server creates a pending order.

Server creates the Razorpay payment order through the backend.

Customer is presented with Razorpay Checkout.

Customer selects an available payment method.

Customer completes or cancels payment.

Razorpay returns the checkout result.

Backend verifies the payment signature.

Backend receives and validates Razorpay webhook events.

Backend verifies the payment status.

The order is marked Paid only after reliable confirmation.

The customer receives an order confirmation.

The business owner receives an order notification.

Salad Stories — Master Business Requirements Document  •
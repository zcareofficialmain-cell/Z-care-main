# ZCare – Payment Gateway Onboarding Requirements
**Client-Side Preparation Guide & Checklist**

---

## Overview

To enable online payments for **ZCare** (accepting UPI, Credit/Debit Cards, and Net Banking in INR for ₹199/month and ₹1,299/year plans), Indian payment gateways (such as Razorpay or Cashfree) must verify the business under Reserve Bank of India (RBI) regulations.

This document outlines everything required from your end to complete verification and go live.

---

## 1. Business & Entity Details

Please provide the basic registration details of your business:

| Detail Required | Description / Example | Your Details |
| :--- | :--- | :--- |
| **Legal Business Name** | Registered legal entity name | |
| **Brand / Trading Name** | **ZCare** | |
| **Business Structure** | Pvt Ltd / LLP / Sole Proprietorship / Partnership | |
| **Registered Address** | Full address with State & PIN code | |
| **Operating Address** | If different from registered address | |
| **Business Category** | Health & Wellness Software / SaaS | |
| **Company Website** | Live website URL | |

---

## 2. Tax Information

| Detail Required | Requirement | Notes |
| :--- | :--- | :--- |
| **Business PAN** | **Mandatory** | Permanent Account Number of the business (or proprietor's PAN for sole proprietorship). |
| **GSTIN (GST Number)** | **Conditional** | Required if you are GST registered. If your business turnover is under ₹20 Lakhs and not registered, a standard non-GST declaration is acceptable. |

---

## 3. Banking & Settlement Information

All subscription revenues will be automatically settled into this bank account:

| Detail Required | Requirement | Notes |
| :--- | :--- | :--- |
| **Account Holder Name** | **Mandatory** | Must exactly match the registered legal business name. |
| **Account Type** | **Current Account** | Commercial gateways generally require a Current Account. |
| **Bank Name & Branch** | **Mandatory** | E.g., HDFC Bank, ICICI Bank, SBI. |
| **Account Number** | **Mandatory** | Number where payouts will be credited. |
| **IFSC Code** | **Mandatory** | 11-character bank branch code. |
| **Bank Account Proof** | **Mandatory (1 proof)** | Either a **cancelled cheque** with printed company name and account number **OR** the latest **bank statement** (last 2–3 months) with official bank logo. |

---

## 4. KYC & Identity Verification

Documents required from the primary Director, Partner, or Business Owner:

### Mandatory for All
1. **Signatory PAN Card**: Copy of the PAN card of the authorized signatory.
2. **Signatory Address Proof**: Aadhaar Card, Passport, or Voter ID.

### Entity-Specific Registration Proof *(Provide whichever applies to you)*:
* **If Private Limited / One Person Company (OPC):**
  * Certificate of Incorporation (COI)
  * MoA & AoA
  * Board Resolution authorizing the signatory to open the gateway account
* **If Limited Liability Partnership (LLP):**
  * Certificate of Incorporation (COI)
  * Registered LLP Agreement
  * Letter of Authorization from designated partners
* **If Sole Proprietorship:**
  * Two government-issued business certificates in the business name (e.g., Udyam / MSME Registration, Shop & Establishment Certificate, or GST Certificate)
* **If Partnership Firm:**
  * Partnership Deed & Registration Certificate (if registered)
  * Authorization letter signed by all partners

---

## 5. Contact Details for Website Compliance

Before activating live transactions, payment gateway underwriters inspect the website. We will place the following contact details on the live website:

* **Customer Support Email:** *(e.g., support@yourdomain.com)*
* **Customer Support Phone Number:** *(Helpline for billing/user queries)*
* **Official Communication Address:** *(For the Contact Us footer)*

---

## 6. Key Business & Policy Decisions

Please confirm your preference for the following three items:

### 1. Subscription & Renewal Model
* **Option A: Prepaid Period (Recommended for Launch)**
  * User pays ₹199 for 30 days or ₹1,299 for 1 year.
  * When the period ends, premium access pauses until they click "Renew" and pay again.
  * *Advantage:* 100% payment success rate on all Indian UPI apps, cards, and net banking with zero setup friction.
* **Option B: Automatic Recurring Debits**
  * Auto-debits user accounts each month/year using UPI AutoPay or Card e-Mandates.
  * *Note:* Subject to RBI recurring payment guidelines (mandatory 24-hour pre-debit notifications and mandate registration).

### 2. Refund & Cancellation Terms
* **Recommended Policy:** Because ZCare already provides a **free 24-hour trial** for all users, paid subscription periods are **non-refundable once activated**, except in verified cases of technical billing failure.
* *Do you approve this policy, or do you have specific refund conditions?*

### 3. Invoicing
* Should customers receive the gateway's automatic payment confirmation receipt via email, or do you need custom GST tax invoices generated for each payment?

---

## Next Steps

1. Fill in the details above and attach the corresponding KYC/bank documents.
2. We will generate and publish the required compliance pages (**Terms of Service**, **Privacy Policy**, **Refund & Cancellation Policy**, and **Contact Us**) on the ZCare website.
3. You will receive an invitation link to complete the 10-minute digital KYC verification on the payment gateway dashboard.

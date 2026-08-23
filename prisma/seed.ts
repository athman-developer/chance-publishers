import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  { key: 'AUTHOR', label: 'Author' },
  { key: 'EMPLOYEE', label: 'Employee' },
  { key: 'PARTNER', label: 'Partner' },
  { key: 'SUPERVISOR', label: 'Supervisor' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'SUPER_ADMIN', label: 'Super Admin' },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { label: role.label },
      create: role,
    });
  }

  const settings = [
    { key: 'NDA_FEE_KES', value: '1000', description: 'NDA processing fee charged to authors before NDA generation.' },
    { key: 'QUOTATION_VALIDITY_DAYS', value: '14', description: 'Default number of days a quotation stays valid before expiring.' },
    { key: 'DEFAULT_CLIENT_PAYMENT_TERMS', value: '70/30', description: 'Default deposit/balance split for client publishing packages.' },
    { key: 'LAUNCH_SUGGESTED_PRICE_KES', value: '50000', description: 'Suggested starting point for a launch organisation quotation — not compulsory, Admin can change per request.' },
    { key: 'KDP_TEAM_EMAIL', value: 'chancepublishersltd@gmail.com', description: 'Email address authors invite as an authorized Amazon KDP / distribution-platform user so staff never need their password.' },
  ];
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting,
    });
  }

  const packages = [
    { name: 'Bronze', priceKes: 40000, sortOrder: 1 },
    { name: 'Silver', priceKes: 50000, sortOrder: 2 },
    { name: 'Gold', priceKes: 60000, sortOrder: 3 },
  ];
  for (const pkg of packages) {
    const existing = await prisma.publishingPackage.findFirst({ where: { name: pkg.name } });
    if (!existing) {
      await prisma.publishingPackage.create({
        data: { ...pkg, status: 'DRAFT', description: `${pkg.name} publishing package — configure included services in Admin before activating.` },
      });
    } else {
      await prisma.publishingPackage.update({
        where: { id: existing.id },
        data: { priceKes: pkg.priceKes, sortOrder: pkg.sortOrder },
      });
    }
  }

  // DRAFT NDA template — technical scaffold only. Must be reviewed and approved
  // by Chance Publishers' legal counsel before any admin ever moves this (or a
  // replacement) to ACTIVE. It is never auto-activated by this seed script.
  const existingTemplate = await prisma.ndaTemplate.findFirst({ where: { name: 'Standard Manuscript NDA' } });
  if (!existingTemplate) {
    await prisma.ndaTemplate.create({
      data: {
        name: 'Standard Manuscript NDA',
        version: 1,
        status: 'DRAFT',
        witnessRequired: true,
        publisherSignatoryName: 'Chance Publishers Limited',
        bodyMarkdown: `NON-DISCLOSURE AND MANUSCRIPT REVIEW AGREEMENT

Reference: {{NDA_REFERENCE}}
Date: {{AGREEMENT_DATE}}

This Agreement is made between:

Chance Publishers Limited ("the Publisher")

and

{{AUTHOR_FULL_NAME}}, holder of ID/Passport number {{AUTHOR_ID_OR_PASSPORT}} ("the Author")

concerning the manuscript titled "{{BOOK_TITLE}}" (Edition: {{EDITION}}), together with
any contributions from: {{CONTRIBUTORS}}.

1. CONFIDENTIALITY
The Publisher agrees to treat the manuscript and all related materials submitted by the
Author as confidential, and will not disclose, reproduce, or distribute the manuscript
to any third party without the Author's written consent, except as reasonably required
for the Publisher's internal editorial, design, and production review process.

2. OWNERSHIP AND COPYRIGHT
This Agreement does not transfer copyright or ownership of the manuscript. Copyright in
the manuscript remains with the Author unless a separate publishing agreement is signed.

3. AUTHOR'S ALTERNATIVE CONTACT
Name: {{ALTERNATIVE_CONTACT_NAME}}
Relationship: {{ALTERNATIVE_CONTACT_RELATIONSHIP}}
Phone: {{ALTERNATIVE_CONTACT_PHONE}}
ID/Passport: {{ALTERNATIVE_CONTACT_ID}}
Email: {{ALTERNATIVE_CONTACT_EMAIL}}

4. TERM
This Agreement remains in effect for the duration of the Publisher's review and, if the
parties proceed, for the duration of the publishing relationship, unless terminated
earlier in writing by either party.

5. SIGNATURES

Author: {{AUTHOR_SIGNATURE}}
Date: {{SIGNATURE_DATE}}

Witness: {{WITNESS_NAME}} (ID: {{WITNESS_ID}})
Signature: {{WITNESS_SIGNATURE}}

For the Publisher: {{PUBLISHER_SIGNATORY}}
Signature: (countersigned in portal)

---
DRAFT TEMPLATE — NOT LEGALLY APPROVED. Chance Publishers' legal counsel must review
and approve this wording, including confirming the confidentiality scope, ownership
clause, and term/duration clause, before this template (or any revision of it) is
activated for real use.`,
      },
    });
    console.log('Seeded DRAFT NDA template (requires legal approval before activation).');
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

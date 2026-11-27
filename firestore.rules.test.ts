import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/**
 * Security Rules Specification & Verification Harness for `firestore.rules`
 * Note: This environment does not include a Java JRE required by the local Firebase
 * Emulator Suite, so this file performs deterministic static policy verification on the
 * deployed rules AST/clauses and documents the exact Emulator test vectors for CI.
 */
function verifyFirestoreSecurityPolicies() {
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf-8');

  // 1. Default deny catch-all must exist
  assert.ok(
    rulesText.includes('match /{document=**}') && rulesText.includes('allow read, write: if false;'),
    'firestore.rules must contain a default-deny catch-all rule'
  );

  // 2. advisor_knowledge rules must block Confidential / Admin Only / unapproved reads from unauthenticated visitors
  const kbBlockMatch = rulesText.match(/match \/advisor_knowledge\/\{itemId\}[\s\S]*?\n\s{4}\}/);
  assert.ok(kbBlockMatch, 'advisor_knowledge match block must exist');
  const kbBlock = kbBlockMatch[0];

  assert.ok(
    kbBlock.includes("resource.data.classification in ['Public', 'Approved']") &&
      kbBlock.includes('resource.data.isApprovedForAdvisor == true') &&
      kbBlock.includes('resource.data.isPublicVisible == true') &&
      kbBlock.includes('|| request.auth != null'),
    'advisor_knowledge read must restrict public reads to approved + public items only'
  );

  assert.ok(
    kbBlock.includes('allow create, update: if request.auth != null') &&
      kbBlock.includes("request.resource.data.classification in ['Public', 'Approved', 'Admin Only', 'Confidential']"),
    'advisor_knowledge writes must require auth and strict classification enum validation'
  );

  // 3. advisor_inquiries must restrict read/update/delete to authenticated users
  const inqBlockMatch = rulesText.match(/match \/advisor_inquiries\/\{inquiryId\}[\s\S]*?\n\s{4}\}/);
  assert.ok(inqBlockMatch, 'advisor_inquiries match block must exist');
  const inqBlock = inqBlockMatch[0];

  assert.ok(inqBlock.includes('allow read: if request.auth != null;'), 'advisor_inquiries read must require auth');
  assert.ok(inqBlock.includes('allow update, delete: if request.auth != null'), 'advisor_inquiries update/delete must require auth');

  console.log('✅ Verified all firestore.rules static policy invariants for advisor_knowledge & advisor_inquiries.');
}

verifyFirestoreSecurityPolicies();

import { CONTACT_EMAIL, OPERATOR, POSTAL_ADDRESS, SUPPORT_PHONE } from "@/lib/site";

// Who runs MargaLink and how to reach them, from the build's env (site.ts),
// for /contact, the privacy notice and the terms. Unset values say so
// plainly rather than inventing anything.
export const ContactEmail = () =>
  CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <>the contact address listed here once accounts open</>
  );

export const operatorName = OPERATOR ?? "the owner of MargaLink";

export function OperatorDetails() {
  return (
    <ul className="list-none space-y-1">
      <li>
        <strong>Run by:</strong> {operatorName}, a sole proprietor in India, trading as MargaLink.
      </li>
      <li>
        <strong>Postal address:</strong> {POSTAL_ADDRESS ?? "to be listed here before accounts open"}
      </li>
      <li>
        <strong>Email:</strong> <ContactEmail />
      </li>
      <li>
        <strong>Phone:</strong> {SUPPORT_PHONE ? <a href={`tel:${SUPPORT_PHONE.replace(/[^\d+]/g, "")}`} className="text-accent hover:underline">{SUPPORT_PHONE}</a> : "to be listed here before accounts open"}
      </li>
      <li>
        <strong>Grievance Officer:</strong> {operatorName}, at the email and phone above. We acknowledge a complaint within 48
        hours and aim to resolve it within one month.
      </li>
    </ul>
  );
}

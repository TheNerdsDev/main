-- The phone number is optional on the contact form now ("What do you have
-- in mind" is the one that's required, checked by the `contact` function).
alter table public.enquiries alter column phone drop not null;

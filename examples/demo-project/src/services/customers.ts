import { sampleCustomers } from '../mocks/customers';
// Deliberately a fixture implementation. This example is NOT a real database client.
export async function saveCustomer(input: {name:string}) { return {id:'fixture-001', ...input, provenance:'fixture'}; }
export function listCustomers() { return sampleCustomers; }

import { saveCustomer } from '../services/customers';
export default function CustomersPage() {
  async function handleSave() { return saveCustomer({name:'Example customer'}); }
  return <button onClick={handleSave}>Save example</button>;
}

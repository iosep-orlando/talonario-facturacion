import type { ObjectId } from "mongodb";
import { ApiError } from "../api";
import { clientToDTO, collections, toObjectId } from "../db";
import type { ClientInput } from "../validation";
import type { ClientDTO } from "../types";

// Los clientes de un usuario. Toda consulta lleva su userId.

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listClients(userId: ObjectId, q = ""): Promise<ClientDTO[]> {
  const { clients } = await collections();
  const search = q.trim().slice(0, 100);
  const filter = search
    ? {
        userId,
        $or: [
          { name: { $regex: escapeRegex(search), $options: "i" } },
          { email: { $regex: escapeRegex(search), $options: "i" } },
          { taxId: { $regex: escapeRegex(search.replace(/[\s.-]/g, "")) } },
        ],
      }
    : { userId };
  const list = await clients.find(filter).sort({ name: 1 }).collation({ locale: "es" }).limit(500).toArray();
  return list.map(clientToDTO);
}

/** El cliente, si es de este usuario; si no, 404 (no se distingue "ajeno" de "no existe"). */
export async function getClientOr404(userId: ObjectId, id: string) {
  const _id = toObjectId(id);
  const { clients } = await collections();
  const client = _id ? await clients.findOne({ _id, userId }) : null;
  if (!client) throw new ApiError(404, "No existe ese cliente.");
  return client;
}

export async function createClient(userId: ObjectId, input: ClientInput): Promise<ClientDTO> {
  const { clients } = await collections();
  const now = new Date();
  const doc = { userId, ...input, createdAt: now, updatedAt: now };
  const { insertedId } = await clients.insertOne(doc);
  return clientToDTO({ _id: insertedId, ...doc });
}

export async function updateClient(userId: ObjectId, id: string, input: ClientInput): Promise<ClientDTO> {
  const current = await getClientOr404(userId, id);
  const { clients, invoices } = await collections();
  const updated = await clients.findOneAndUpdate(
    { _id: current._id, userId },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new ApiError(404, "No existe ese cliente.");
  // Los borradores muestran los datos actuales del cliente; las facturas
  // emitidas conservan los que tenían al emitirse.
  await invoices.updateMany(
    { userId, clientId: current._id, status: "draft" },
    { $set: { client: { name: input.name, taxId: input.taxId, ivaCondition: input.ivaCondition, email: input.email, address: input.address } } },
  );
  return clientToDTO(updated);
}

/** Un cliente con facturas no se borra: las facturas lo nombran. */
export async function deleteClient(userId: ObjectId, id: string): Promise<void> {
  const current = await getClientOr404(userId, id);
  const { clients, invoices } = await collections();
  const used = await invoices.countDocuments({ userId, clientId: current._id }, { limit: 1 });
  if (used > 0) throw new ApiError(409, "Tiene facturas (o borradores): no se puede borrar.");
  await clients.deleteOne({ _id: current._id, userId });
}

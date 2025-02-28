import { grocyFetch } from "~/server/api/modules/grocy/service/client"
import { protectedProcedure } from "~/server/api/trpc"
import z from "zod"

const GrocyStatusSchema = z.object({
  grocy_version: z.object({
    Version: z.string(),
    ReleaseDate: z.string(),
  }),
})

const GrocySystemConfigSchema = z.object({
  LOCALE: z.string(),
})

export const checkGrocyConnectionProcedure = protectedProcedure.query(
  async () => {
    const res = await grocyFetch(`/system/info`)

    const body = await res.json()

    return GrocyStatusSchema.safeParse(body)
  }
)

export const checkGrocyLanguage = async () => {
  const res = await grocyFetch(`/system/config`)

  const body = await res.json()

  return GrocySystemConfigSchema.safeParse(body)
}

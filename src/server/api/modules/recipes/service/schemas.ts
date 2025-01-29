import z from "zod"

import { logger } from "~/lib/logger"

// Define the Schema.org "Recipe" schema
const HowToStepSchema = z.object({
  "@type": z.literal("HowToStep"),
  text: z.string(),
})

const HowToSectionSchema = z.object({
  "@type": z.literal("HowToSection"),
  name: z.string(),
  itemListElement: z.array(
    z.union([z.lazy(() => HowToStepSchema), z.lazy(() => HowToSectionSchema)])
  ),
})

const RecipeSchema = z.object({
  "@context": z.string().optional(),
  "@type": z.union([
    z.literal("Recipe"),
    z
      .array(z.string())
      .refine((arr) => arr.includes("Recipe"), {
        message: "Array must contain 'Recipe' at least once",
      }),
  ]),
  name: z.string(),
  recipeIngredient: z.array(z.string()),
  recipeInstructions: z.union([
    z.string(),
    z.array(z.union([HowToStepSchema, HowToSectionSchema])),
  ]),
  image: z
    .union([
      z.string(),
      z.array(z.string()),
      z.object({
        "@type": z.literal("ImageObject"),
        url: z.string(),
        height: z.number().optional(),
        width: z.number().optional(),
      }),
    ])
    .optional(),
  recipeYield: z.union([z.string(), z.array(z.string())]).optional(),
  // Add other fields as needed
})

export function parseRecipeJson(jsonString: string) {
  try {
    const jsonObject = JSON.parse(jsonString)
    return RecipeSchema.parse(jsonObject)
  } catch (error) {
    logger.warn("Failed to parse or validate JSON string:", error)
    return null
  }
}

export function beautifyInstructions(
  input: z.infer<typeof RecipeSchema>["recipeInstructions"]
): string {
  if (typeof input === "string") {
    return input.replace(/\n/g, "<br>")
  }

  if (Array.isArray(input)) {
    let result = ""
    let inOl = false

    input.forEach((step, index) => {
      if (step["@type"] === "HowToStep") {
        if (!inOl) {
          result += "<ol>"
          inOl = true
        }
        result += `<li>${step.text}</li>`
      } else if (step["@type"] === "HowToSection") {
        if (inOl) {
          result += "</ol>"
          inOl = false
        }
        const sectionSteps = step.itemListElement
          .map((subStep) => `<li>${subStep.text}</li>`)
          .join("")
        result += `<h4>${step.name}</h4><ol>${sectionSteps}</ol>`
      } else {
        throw new Error("Invalid step type")
      }
    })

    if (inOl) {
      result += "</ol>"
    }

    return result
  }

  throw new Error("Invalid recipeInstructions format")
}

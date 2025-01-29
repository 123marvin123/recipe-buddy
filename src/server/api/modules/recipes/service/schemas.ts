import { checkGrocyLanguage } from "~/server/api/modules/grocy/procedures/checkGrocyConnection"
import z from "zod"

// Define the Schema.org "Recipe" schema
const HowToStepSchema = z.object({
  "@type": z.literal("HowToStep"),
  text: z.string(),
})

const HowToSectionSchema = z.object({
  "@type": z.literal("HowToSection"),
  name: z.string(),
  itemListElement: z.union([
    z.string(),
    z.array(z.lazy(() => HowToStepSchema)),
  ]),
})

export const ImageObjectSchema = z.object({
  "@type": z.literal("ImageObject"),
  url: z.string(),
  height: z.number().optional(),
  width: z.number().optional(),
})

export const NutritionInformation = z.object({
  "@type": z.literal("NutritionInformation"),
  calories: z.string().optional(),
  carbohydrateContent: z.string().optional(),
  cholesterolContent: z.string().optional(),
  fatContent: z.string().optional(),
  fiberContent: z.string().optional(),
  proteinContent: z.string().optional(),
  saturatedFatContent: z.string().optional(),
  servingSize: z.string().optional(),
  sodiumContent: z.string().optional(),
  sugarContent: z.string().optional(),
  transFatContent: z.string().optional(),
  unsaturatedFatContent: z.string().optional(),
})

export const RecipeSchema = z.object({
  "@context": z.string().optional(),
  "@type": z.union([
    z.literal("Recipe"),
    z.array(z.string()).refine((arr) => arr.includes("Recipe"), {
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
    .union([z.string(), z.array(z.string()), ImageObjectSchema])
    .optional(),
  recipeYield: z.union([z.string(), z.array(z.string())]).optional(),
  nutrition: z.lazy(() => NutritionInformation).optional(),
})

async function supplementInstructionsWithNutrition(
  recipe: z.infer<typeof RecipeSchema>
) {
  const translations = {
    en: {
      nutrient: "Nutrient",
      nutrients: "Nutritional Information",
      amount: "Amount",
    },
    de: {
      nutrient: "Nährstoff",
      nutrients: "Nährwertangaben",
      amount: "Menge",
    },
  }

  const translatedKeys = {
    en: {
      calories: "Calories",
      carbohydrateContent: "Carbohydrates",
      cholesterolContent: "Cholesterol",
      fatContent: "Fat",
      fiberContent: "Fiber",
      proteinContent: "Protein",
      saturatedFatContent: "Saturated Fat",
      servingSize: "Serving Size",
      sodiumContent: "Sodium",
      sugarContent: "Sugar",
      transFatContent: "Trans Fat",
      unsaturatedFatContent: "Unsaturated Fat",
    },
    de: {
      calories: "Kalorien",
      carbohydrateContent: "Kohlenhydrate",
      cholesterolContent: "Cholesterin",
      fatContent: "Fett",
      fiberContent: "Ballaststoffe",
      proteinContent: "Eiweiß",
      saturatedFatContent: "Gesättigte Fettsäuren",
      servingSize: "Portionsgröße",
      sodiumContent: "Natrium",
      sugarContent: "Zucker",
      transFatContent: "Transfette",
      unsaturatedFatContent: "Ungesättigte Fettsäuren",
    },
  }

  const languageResponse = await checkGrocyLanguage()
  let userLanguage = "en"
  if (languageResponse.success) {
    userLanguage = languageResponse.data.LOCALE
  }

  const headers =
    translations[userLanguage as keyof typeof translations] ||
    translations["en"]

  const keys =
    (translatedKeys[userLanguage as keyof typeof translatedKeys] as Record<
      string,
      string
    >) || (translatedKeys["en"] as Record<string, string>)

  let result = `<h3>${headers.nutrients}</h3><table style="border-spacing: 10px;"><thead><tr><th>${headers.nutrient}</th><th>${headers.amount}</th></tr></thead><tbody>`
  if (recipe.nutrition) {
    for (const [key, value] of Object.entries(recipe.nutrition)) {
      if (key === "@type" || key === "servingSize") continue
      result += `<tr><td>${keys[key]}</td><td>${value}</td></tr>`
    }

    result += "</tbody></table><br><br>"

    if (recipe.nutrition.servingSize) {
      result += `<p>${keys.servingSize}: ${recipe.nutrition.servingSize}</p>`
    } else if (recipe.recipeYield) {
      if (Array.isArray(recipe.recipeYield) && recipe.recipeYield.length > 0) {
        result += `<p>${keys.servingSize}: ${recipe.recipeYield[0]}</p>`
      } else {
        result += `<p>${keys.servingSize}: ${recipe.recipeYield}</p>`
      }
    }
  }

  return result
}

export async function beautifyInstructions(
  recipe: z.infer<typeof RecipeSchema>
): Promise<string> {
  const input = recipe.recipeInstructions

  if (typeof input === "string") {
    return input.replace(/\n/g, "<br>")
  }

  if (Array.isArray(input)) {
    let result = ""
    let inOl = false

    input.forEach((step) => {
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
        const sectionSteps = Array.isArray(step.itemListElement)
          ? step.itemListElement
              .map((subStep) => {
                return `<li>${subStep.text}</li>`
              })
              .join("")
          : step.itemListElement
        result += `<h4>${step.name}</h4><ol>${sectionSteps}</ol>`
      } else {
        throw new Error("Invalid step type")
      }
    })

    if (inOl) {
      result += "</ol>"
    }

    result += await supplementInstructionsWithNutrition(recipe)

    return result
  }

  throw new Error("Invalid recipeInstructions format")
}

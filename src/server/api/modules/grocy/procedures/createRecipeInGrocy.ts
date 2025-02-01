import {
  CreateRecipeInGrocyCommandSchema,
  UnignoredIngredient,
} from "~/server/api/modules/grocy/procedures/createRecipeInGrocySchema"
import { grocyFetch } from "~/server/api/modules/grocy/service/client"
import { getGrocyProducts } from "~/server/api/modules/grocy/service/getGrocyProducts"
import { deleteRecipe } from "~/server/api/modules/recipes/service/deleteRecipe"
import {
  NutritionInformation,
  supplementInstructionsWithNutrition,
} from "~/server/api/modules/recipes/service/schemas"
import { protectedProcedure } from "~/server/api/trpc"
import { db } from "~/server/db"
import { recipes as recipeTable } from "~/server/db/schema"
import { eq } from "drizzle-orm"
import normalizeUrl from "normalize-url"
import slugify from "slugify"
import { v4 } from "uuid"
import z from "zod"

import { logger } from "~/lib/logger"

export const createRecipeInGrocyProcedure = protectedProcedure
  .input(CreateRecipeInGrocyCommandSchema)
  .mutation(async ({ input }) => {
    let imageFilename: string | undefined = undefined

    const grocyProducts = await getGrocyProducts()
    const originalRecipe = await db.query.recipes.findFirst({
      where: eq(recipeTable.id, input.recipeBuddyRecipeId),
    })

    if (input.imageUrl) {
      const normalised = normalizeUrl(input.imageUrl, {
        removeQueryParameters: true,
      })

      const split = normalised.split(".")
      const extension = split[split.length - 1]

      const image = await fetch(input.imageUrl)
      const blob = await image.blob()

      const slug = slugify(input.recipeName)

      const uuid = v4()
      const [beginningOfUuid] = uuid.split("-")

      imageFilename = slug + "-" + beginningOfUuid + "." + extension

      logger.info(
        { imageFilename, base64: btoa(imageFilename) },
        "Uploading image to Grocy"
      )

      await grocyFetch(`/files/recipepictures/${btoa(imageFilename)}`, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "application/octet-stream" },
      })

      logger.info("Uploaded image to Grocy")
    }

    logger.info(input, "Creating recipe in Grocy")

    if (input.embedNutritionalInformation && originalRecipe) {
      const nutrition = NutritionInformation.safeParse({
        "@type": "NutritionInformation",
        calories: originalRecipe.calories ?? undefined,
        carbohydrateContent: originalRecipe.carbohydrateContent ?? undefined,
        cholesterolContent: originalRecipe.cholesterolContent ?? undefined,
        fatContent: originalRecipe.fatContent ?? undefined,
        fiberContent: originalRecipe.fiberContent ?? undefined,
        proteinContent: originalRecipe.proteinContent ?? undefined,
        saturatedFatContent: originalRecipe.saturatedFatContent ?? undefined,
        sodiumContent: originalRecipe.sodiumContent ?? undefined,
        sugarContent: originalRecipe.sugarContent ?? undefined,
        transFatContent: originalRecipe.transFatContent ?? undefined,
        unsaturatedFatContent:
          originalRecipe.unsaturatedFatContent ?? undefined,
      })

      if (nutrition.success) {
        input.method += await supplementInstructionsWithNutrition(
          nutrition.data,
          originalRecipe.nutritionServings ??
            originalRecipe.servings?.toString() ??
            undefined
        )
      } else {
        logger.error(nutrition.error, "Failed to parse nutrition information")
      }
    }

    if (input.embedYoutubeUrl && originalRecipe?.videoUrl) {
      const youtubeId = originalRecipe.videoUrl
        .replace("https://www.youtube.com/watch?v=", "")
        .replace("https://youtu.be/", "")

      input.method += `<p><iframe frameborder="0" src="//www.youtube.com/embed/${youtubeId}" width="640" height="360" class="note-video-clip"></iframe><br></p>`
    }

    const recipeBody = {
      name: input.recipeName,
      description: input.method,
      picture_file_name: imageFilename,
      base_servings: input.servings,
    }

    const recipeResponse = await grocyFetch("/objects/recipes", {
      method: "POST",
      body: JSON.stringify(recipeBody),
      headers: { "Content-Type": "application/json" },
    })

    const recipeJson = await recipeResponse.json()

    logger.info(recipeJson, "Recipe created")

    const recipeId = z.coerce.string().parse(recipeJson.created_object_id)

    const filteredIngredients = input.ingredients.filter(
      (a): a is UnignoredIngredient => !a.ignored
    )

    for (const ingredient of filteredIngredients) {
      logger.info(ingredient, `Creating ingredient [${ingredient.scrapedName}]`)

      const grocyProduct = grocyProducts.find(
        (a) => a.id === ingredient.productId
      )

      if (!grocyProduct) continue

      const quantitiesReq = await grocyFetch(
        `/objects/quantity_unit_conversions_resolved?query[]=product_id=${ingredient.productId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      const quantities = await quantitiesReq.json()
      const validQuantities = new Set<number>([
        ...quantities.flatMap((q: { from_qu_id: number; to_qu_id: number }) => [
          q.from_qu_id,
          q.to_qu_id,
        ]),
        parseInt(grocyProduct.qu_id_stock),
        parseInt(grocyProduct.qu_id_price),
        parseInt(grocyProduct.qu_id_consume),
        parseInt(grocyProduct.qu_id_purchase),
      ])

      const useAnyUnit = !validQuantities.has(parseInt(ingredient.unitId))
      const isCorrectUnit = ingredient.unitId === grocyProduct.qu_id_stock

      if (!isCorrectUnit && !useAnyUnit) {
        const conversion = quantities.find(
          (q: { from_qu_id: number; to_qu_id: number }) =>
            q.from_qu_id === parseInt(ingredient.unitId) &&
            q.to_qu_id === parseInt(grocyProduct.qu_id_stock)
        )
        if (conversion) {
          ingredient.amount *= conversion.factor
        }
      }

      const body = {
        recipe_id: recipeId,
        product_id: ingredient.productId,
        amount: ingredient.amount,
        qu_id: ingredient.unitId,
        only_check_single_unit_in_stock: useAnyUnit ? "1" : "0",
        not_check_stock_fulfillment:
          grocyProduct.not_check_stock_fulfillment_for_recipes === 1
            ? "1"
            : "0",
        note: ingredient.note,
        ingredient_group: ingredient.group,
      }

      logger.info(JSON.stringify(body))

      const ingredientResponse = await grocyFetch("/objects/recipes_pos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      })

      const ingredientJson = await ingredientResponse.json()

      if (!ingredientResponse.ok) {
        throw new Error(ingredientJson.error_message ?? "An error occurred")
      }

      logger.info(ingredientJson, "Ingredient created")
    }

    logger.info("Recipe creation success, deleting recipe from Recipe Buddy")

    await deleteRecipe(input.recipeBuddyRecipeId)
  })

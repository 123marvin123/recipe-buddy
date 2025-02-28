import { TRPCError } from "@trpc/server"
import {
  beautifyInstructions,
  ImageObjectSchema,
  RecipeSchema,
} from "~/server/api/modules/recipes/service/schemas"
import { InsertIngredient, InsertRecipe } from "~/server/db/schema"
import { JSDOM } from "jsdom"
import { z } from "zod"

import { logger } from "~/lib/logger"

async function getNodeListOfMetadataNodesFromUrl(url: string) {
  const dom = await JSDOM.fromURL(url)
  const nodeList: NodeList = dom.window.document.querySelectorAll(
    "script[type='application/ld+json']"
  )

  if (nodeList.length === 0) {
    throw new TRPCError({
      message: "The linked page contains no metadata",
      code: "INTERNAL_SERVER_ERROR",
    })
  }

  return nodeList
}

async function getNodeListOfMetadataNodesFromHtml(html: string) {
  const dom = new JSDOM(html)
  const nodeList: NodeList = dom.window.document.querySelectorAll(
    "script[type='application/ld+json']"
  )

  if (nodeList.length === 0) {
    throw new TRPCError({
      message: "The linked page contains no metadata",
      code: "INTERNAL_SERVER_ERROR",
    })
  }

  return nodeList
}

function jsonObjectHasGraph(jsonObject: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(jsonObject, "@graph")
}

function getSchemaRecipeFromNodeList(
  nodeList: NodeList
): z.infer<typeof RecipeSchema> {
  for (const node of nodeList.values()) {
    const { textContent } = node

    if (!textContent) {
      logger.debug("No text content in node, trying next node")
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsedNodeContent: any

    try {
      parsedNodeContent = JSON.parse(textContent)
    } catch (e) {
      logger.error(
        { error: e, textContent },
        "Error in extracting JSON from node content"
      )
      continue
    }

    if (Array.isArray(parsedNodeContent)) {
      console.log("its an array")
      for (const metadataObject of parsedNodeContent) {
        const recipe = RecipeSchema.safeParse(metadataObject)
        if (recipe.success) {
          return recipe.data
        }
      }
    } else {
      if (RecipeSchema.safeParse(parsedNodeContent).success) {
        return parsedNodeContent
      }
      if (jsonObjectHasGraph(parsedNodeContent)) {
        for (const graphNode of parsedNodeContent["@graph"]) {
          const recipe = RecipeSchema.safeParse(graphNode)
          if (recipe.success) {
            return recipe.data
          }
        }
      }
    }
  }
  throw new Error("Unable to extract Recipe metadata from provided url")
}

function queryRecipeImageUrl(recipeData: Record<string, unknown>) {
  if (Array.isArray(recipeData.image) && recipeData.image.length > 0) {
    return recipeData.image[0]
  }
  if (typeof recipeData.image === "string") {
    return recipeData.image
  }
  if (ImageObjectSchema.safeParse(recipeData.image).success) {
    return (recipeData.image as z.infer<typeof ImageObjectSchema>).url
  }
  return undefined
}

function queryRecipeServings(
  recipeYield: z.infer<typeof RecipeSchema>["recipeYield"]
) {
  let element: string | undefined = undefined

  if (Array.isArray(recipeYield) && recipeYield.length > 0) {
    element = recipeYield[0]
  }
  if (typeof recipeYield === "string") {
    element = recipeYield
  }

  let res = 0
  if (element && !isNaN(Number(element))) {
    res = Number(element)
  } else if (element) {
    const match = element.match(/^\d+/)
    if (match) {
      res = Number(match[0])
    }
  }

  return res
}

export async function hydrateRecipe(url: string) {
  const nodeList: NodeList = await getNodeListOfMetadataNodesFromUrl(url)
  return createRecipeData(nodeList)
}

export async function hydrateRecipeFromHTML(html: string) {
  const nodeList: NodeList = await getNodeListOfMetadataNodesFromHtml(html)
  return createRecipeData(nodeList)
}

async function createRecipeData(nodeList: NodeList) {
  const recipeData = getSchemaRecipeFromNodeList(nodeList)

  const ingredients: string[] = recipeData.recipeIngredient
    .flat()
    .map((ingredient: string) => ingredient.trim())

  const ings: Pick<InsertIngredient, "scrapedName">[] = ingredients.map(
    (a) => ({ scrapedName: a })
  )

  const recipe: InsertRecipe = {
    name: recipeData.name,
    url: "",
    steps: await beautifyInstructions(recipeData),
    imageUrl: queryRecipeImageUrl(recipeData),
    servings: queryRecipeServings(recipeData.recipeYield),
    videoUrl: recipeData.video?.contentUrl,
    calories: recipeData.nutrition?.calories,
    nutritionServings: recipeData.nutrition?.servingSize,
    carbohydrateContent: recipeData.nutrition?.carbohydrateContent,
    cholesterolContent: recipeData.nutrition?.cholesterolContent,
    fatContent: recipeData.nutrition?.fatContent,
    fiberContent: recipeData.nutrition?.fiberContent,
    proteinContent: recipeData.nutrition?.proteinContent,
    saturatedFatContent: recipeData.nutrition?.saturatedFatContent,
    sodiumContent: recipeData.nutrition?.sodiumContent,
    sugarContent: recipeData.nutrition?.sugarContent,
    transFatContent: recipeData.nutrition?.transFatContent,
    unsaturatedFatContent: recipeData.nutrition?.unsaturatedFatContent,
  }

  return { recipe, ingredients: ings }
}

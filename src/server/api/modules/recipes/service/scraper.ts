import { TRPCError } from "@trpc/server"
import {
  beautifyInstructions,
  parseRecipeJson,
} from "~/server/api/modules/recipes/service/schemas"
import { InsertIngredient, InsertRecipe } from "~/server/db/schema"
import { JSDOM } from "jsdom"

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

function jsonObjectIsRecipe(jsonObject: Record<string, unknown>): boolean {
  try {
    const parsed = parseRecipeJson(JSON.stringify(jsonObject))
    return parsed != null
  } catch (e) {
    logger.error(e)
    return false
  }
}

function jsonObjectHasGraph(jsonObject: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(jsonObject, "@graph")
}

function getSchemaRecipeFromNodeList(nodeList: NodeList) {
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
        if (jsonObjectIsRecipe(metadataObject)) {
          return metadataObject
        }
      }
    } else {
      if (jsonObjectIsRecipe(parsedNodeContent)) {
        return parsedNodeContent
      }
      if (jsonObjectHasGraph(parsedNodeContent)) {
        for (const graphNode of parsedNodeContent["@graph"]) {
          if (jsonObjectIsRecipe(graphNode)) {
            return graphNode
          }
        }
      }
    }
  }
  throw new Error("Unable to extract Recipe metadata from provided url")
}

function queryRecipeImageUrl(recipeData: Record<string, unknown>) {
  if (Array.isArray(recipeData.image)) {
    return recipeData.image[0]
  }
  if (typeof recipeData.image === "string") {
    return recipeData.image
  }
  if (typeof recipeData.image === "object") {
    return recipeData.image.url
  }
  return undefined
}

function queryRecipeServings(recipeData: Record<string, unknown>) {
  if (Array.isArray(recipeData.recipeYield)) {
    return recipeData.recipeYield[0]
  }
  if (typeof recipeData.recipeYield === "string") {
    return recipeData.recipeYield
  }
  return undefined
}

export async function hydrateRecipe(url: string) {
  const nodeList: NodeList = await getNodeListOfMetadataNodesFromUrl(url)

  const recipeDataString = JSON.stringify(getSchemaRecipeFromNodeList(nodeList))
  const recipeData = parseRecipeJson(recipeDataString)

  if (!recipeData) {
    throw new Error("Invalid recipe data")
  }

  const ingredients: string[] = recipeData.recipeIngredient
    .flat()
    .map((ingredient: string) => ingredient.trim())

  const ings: Pick<InsertIngredient, "scrapedName">[] = ingredients.map(
    (a) => ({ scrapedName: a })
  )

  const recipe: InsertRecipe = {
    name: recipeData.name,
    url: "",
    steps: beautifyInstructions(recipeData.recipeInstructions),
    imageUrl: queryRecipeImageUrl(recipeData),
    servings: queryRecipeServings(recipeData),
  }

  return { recipe, ingredients: ings }
}

export async function hydrateRecipeFromHTML(html: string) {
  const nodeList: NodeList = await getNodeListOfMetadataNodesFromHtml(html)

  const recipeDataString = JSON.stringify(getSchemaRecipeFromNodeList(nodeList))
  const recipeData = parseRecipeJson(recipeDataString)

  if (!recipeData) {
    throw new Error("Invalid recipe data")
  }

  const ingredients: string[] = recipeData.recipeIngredient
    .flat()
    .map((ingredient: string) => ingredient.trim())

  const ings: Pick<InsertIngredient, "scrapedName">[] = ingredients.map(
    (a) => ({ scrapedName: a })
  )

  const recipe: InsertRecipe = {
    name: recipeData.name,
    url: "",
    steps: beautifyInstructions(recipeData.recipeInstructions),
    imageUrl: queryRecipeImageUrl(recipeData),
    servings: queryRecipeServings(recipeData),
  }

  return { recipe, ingredients: ings }
}

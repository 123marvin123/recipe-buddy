"use client"

import * as React from "react"
import { useState } from "react"
import { DialogBody } from "next/dist/client/components/react-dev-overlay/internal/components/Dialog"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ScrapeRecipeFromHTML,
  ScrapeRecipeFromHTMLSchema,
} from "~/server/api/modules/recipes/procedures/scrapeRecipeSchema"
import { api } from "~/trpc/react"
import { useForm } from "react-hook-form"

import { cn } from "~/lib/utils"
import { Button, ButtonProps, buttonVariants } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form"
import { Textarea } from "~/components/ui/textarea"
import { Icons } from "~/components/icons"

interface NewRecipeFromTextDialogProps extends ButtonProps {}
export const NewRecipeFromTextDialog = ({
  className,
  variant,
  ...props
}: NewRecipeFromTextDialogProps) => {
  const [open, setOpen] = useState(false)

  const form = useForm<ScrapeRecipeFromHTML>({
    resolver: zodResolver(ScrapeRecipeFromHTMLSchema),
  })

  const utils = api.useContext()

  const { mutate, isLoading } = api.recipe.scrapeHtml.useMutation({
    onSuccess: () => {
      utils.recipe.list.invalidate()
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            buttonVariants({ variant }),
            {
              "cursor-not-allowed opacity-60": isLoading,
            },
            className
          )}
          disabled={isLoading}
          type="submit"
          {...props}
        >
          {isLoading ? (
            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Icons.add className="mr-2 h-4 w-4" />
          )}
          Add recipe from HTML
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Recipe from HTML</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Form {...form}>
            <form
              id="addRecipeFromHtml"
              onSubmit={form.handleSubmit((a) => mutate(a))}
            >
              <FormField
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HTML Content</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter HTML content"
                        autoComplete={"off"}
                        rows={10}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The raw HTML content of the recipe to scrape
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
                name="html"
                control={form.control}
              />
            </form>
          </Form>
        </DialogBody>
        <DialogFooter>
          <Button disabled={isLoading} type="submit" form="addRecipeFromHtml">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

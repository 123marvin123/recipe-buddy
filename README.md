# Recipe Buddy

What was changed in this fork:

- Add **Add recipe from HTML** button to allow creating a recipe by copying a websites html code (useful for paid recipes that need auth)
- Instead of using "any unit" if selected unit is not the same as stock unit, we will apply the corresponding unit conversion.
- Scraping logic was reworked to be more robust and to support more websites such as Cookidoo, Chefkoch and Allrecipes.
- HowToSection and HowToStep is now correctly displayed in the recipe instructions view in Grocy.

## How you can have a go

"Well gee, George, that sounds mighty swell", I hear you say, "but how does little old me go about harnessing the
TypeScript goblins for my own recipe-scraping requirements?"

Well, dear reader, as I am a benevolent goblin-wrangler, I have imprisoned them in a poorly written Dockerfile for you!
All one needs to do to benefit from the gobliny goodness is as follows:

1. Generate yourself an auth secret using `openssl rand -base64 32`
2. Get the base url of your Grocy instance (everything up to the first `/`)
3. Get an API key for your Grocy instance
4. Run the following command:
    ```
   docker run \
     -p 3005:3000 \
     -v rb_data:/home/node/app/data \
     --env GROCY_API_KEY=YOUR_GROCY_API_KEY \
     --env GROCY_BASE_URL=YOUR_GROCY_BASE_URL \
     --env NEXTAUTH_SECRET=YOUR_AUTH_SECRET \
     --env NEXTAUTH_URL=http://localhost:3005 \
     ghcr.io/123marvin123/recipe-buddy
   ```

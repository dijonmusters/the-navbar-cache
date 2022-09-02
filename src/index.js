import { createServer } from "@graphql-yoga/common";
import { Client } from "@notionhq/client";
import { marked } from "marked";
import { NotionToMarkdown } from "notion-to-md";

const schema = {
  typeDefs: `
    type Episode {
      id: String!
      slug: String!
      title: String!
      releaseDate: String!
      audioUrl: String!
      html: String!
    },
    type Query {
      episodes: [Episode]!
      episode(slug: String!): Episode
    }
  `,

  resolvers: {
    Query: {
      episodes: async (
        parent,
        args,
        { NAVBAR, NOTION_API_SECRET, DATABASE_ID }
      ) => {
        const raw = await NAVBAR.get("/episodes");
        const cachedEpisodes = JSON.parse(raw);

        if (cachedEpisodes) {
          return cachedEpisodes;
        }

        const notion = new Client({
          auth: NOTION_API_SECRET,
          notionVersion: "2022-02-22",
        });

        const episodes = [];
        let data = {};

        do {
          data = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
              property: "Status",
              select: {
                equals: "Released",
              },
            },
            sorts: [
              {
                property: "Release date",
                direction: "descending",
              },
            ],
            start_cursor: data?.next_cursor ?? undefined,
          });

          data.results.forEach((episode) => {
            episodes.push({
              id: episode.id,
              title: episode.properties.Name.title[0].text.content,
              slug: episode.properties.Slug.formula.string,
              releaseDate: episode.properties["Release date"].date.start,
              audioUrl: episode.properties["Audio URL"].url,
              html: "TODO! Implement this",
            });
          });
        } while (data?.has_more);

        await NAVBAR.put("/episodes", JSON.stringify(episodes));

        return episodes;
      },
      episode: async (
        parent,
        { slug },
        { NAVBAR, NOTION_API_SECRET, DATABASE_ID }
      ) => {
        const raw = await NAVBAR.get(`/episodes/${slug}`);
        const cachedEpisode = JSON.parse(raw);

        if (cachedEpisode) {
          return cachedEpisode;
        }

        const notion = new Client({
          auth: NOTION_API_SECRET,
          notionVersion: "2022-02-22",
        });

        const episodeResults = await notion.databases.query({
          database_id: DATABASE_ID,
          filter: {
            property: "Slug",
            formula: {
              string: {
                equals: `/episodes/${slug}`,
              },
            },
          },
        });

        const [rawEpisode] = episodeResults.results;

        const n2m = new NotionToMarkdown({ notionClient: notion });
        const blocks = await n2m.pageToMarkdown(rawEpisode.id);
        const md = n2m.toMarkdownString(blocks);
        const html = marked.parse(md);

        const episode = {
          id: rawEpisode.id,
          title: rawEpisode.properties.Name.title[0].text.content,
          slug: rawEpisode.properties.Slug.formula.string,
          releaseDate: rawEpisode.properties["Release date"].date.start,
          audioUrl: rawEpisode.properties["Audio URL"].url,
          html,
        };

        await NAVBAR.put(`/episodes/${slug}`, JSON.stringify(episode));

        return episode;
      },
    },
  },
};

export default {
  fetch(request, env) {
    const server = createServer({
      schema,
    });
    return server.handleRequest(request, env);
  },
};

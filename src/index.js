import { Client } from "@notionhq/client";

export default {
  async fetch(request, { DATABASE_ID, NOTION_API_SECRET, NAVBAR }) {
    const cachedEpisodes = JSON.parse(await NAVBAR.get("episodes"));

    if (cachedEpisodes) {
      return new Response(JSON.stringify(cachedEpisodes), {
        headers: { "content-type": "application/json" },
      });
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
        });
      });
    } while (data?.has_more);

    const episodesString = JSON.stringify(episodes);

    await NAVBAR.put("episodes", episodesString);

    return new Response(episodesString, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
};

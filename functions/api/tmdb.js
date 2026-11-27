const TMDB_API_KEY = "87aa3987ab1ceda87599ea8c3bc28925";

export async function onRequestGet(context) {
  const { request, env } = context;
  const apiKey = env.TMDB_API_KEY || TMDB_API_KEY;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const baseUrl = "https://api.themoviedb.org/3";
  let tmdbUrl = "";

  if (action === "trending") {
    const rawType = url.searchParams.get("type");
    const media = ["all", "movie", "tv"].includes(rawType) ? rawType : "all";
    tmdbUrl = `${baseUrl}/trending/${media}/week?api_key=${encodeURIComponent(apiKey)}&language=en-US&page=${page}`;
  } else if (action === "search") {
    const query = (url.searchParams.get("query") || "").trim();
    if (!query) {
      return Response.json({ results: [], total_pages: 0, total_results: 0 });
    }
    const filterType = url.searchParams.get("type") || "multi";
    const endpoint = ["movie", "tv", "multi"].includes(filterType) ? filterType : "multi";
    tmdbUrl = `${baseUrl}/search/${endpoint}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`;
  } else if (action === "details") {
    const id = url.searchParams.get("id") || "";
    const type = url.searchParams.get("type") || "movie";

    if (!/^\d+$/.test(id) || (type !== "movie" && type !== "tv")) {
      return Response.json({ error: "Invalid TMDB ID or media type." }, { status: 400 });
    }
    tmdbUrl = `${baseUrl}/${type}/${id}?api_key=${encodeURIComponent(apiKey)}&append_to_response=videos&language=en-US`;
  } else if (action === "season") {
    const id = url.searchParams.get("id") || "";
    const season = url.searchParams.get("season") || "1";

    if (!/^\d+$/.test(id) || !/^\d+$/.test(season)) {
      return Response.json({ error: "Invalid TMDB ID or season number." }, { status: 400 });
    }
    tmdbUrl = `${baseUrl}/tv/${id}/season/${season}?api_key=${encodeURIComponent(apiKey)}&language=en-US`;
  } else {
    return Response.json({ error: "Invalid action parameter." }, { status: 400 });
  }

  const response = await fetch(tmdbUrl);
  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

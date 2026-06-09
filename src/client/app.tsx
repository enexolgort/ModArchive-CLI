import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Sidebar, { SidebarView } from "./components/Sidebar";
import ArtistList from "./components/ArtistList";
import ModuleList from "./components/ModuleList";
import GenreList from "./components/GenreList";
import SearchView from "./components/SearchView";
import StatsView from "./components/StatsView";
import NowPlayingBar from "./components/NowPlayingBar";
import { usePlayer } from "./hooks/usePlayer";
import { Artist, Genre } from "./hooks/useDb";

type Panel = "sidebar" | "main";
type DrillDown =
  | { type: "artist-modules"; artist: Artist }
  | { type: "genre-modules"; genre: Genre }
  | null;

const VIEWS: SidebarView[] = ["artists", "genres", "search", "stats"];

export default function App() {
  const { exit } = useApp();
  const { status, nowPlaying, error, play, stop } = usePlayer();

  const [view, setView] = useState<SidebarView>("artists");
  const [panel, setPanel] = useState<Panel>("main");
  const [drill, setDrill] = useState<DrillDown>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useInput((input, key) => {
    if (input === "q" || input === "Q") {
      stop();
      exit();
      return;
    }
    if (input === "s" || input === "S") {
      stop();
      return;
    }
    if (key.tab) {
      setPanel((p) => (p === "sidebar" ? "main" : "sidebar"));
      return;
    }

    if (panel === "sidebar") {
      const ci = VIEWS.indexOf(view);
      if (key.upArrow) {
        setView(VIEWS[Math.max(0, ci - 1)]);
        setDrill(null);
      }
      if (key.downArrow) {
        setView(VIEWS[Math.min(VIEWS.length - 1, ci + 1)]);
        setDrill(null);
      }
      if (key.return) {
        setPanel("main");
      }
    }
  });

  const handleSelectArtist = (artist: Artist) => {
    setDrill({ type: "artist-modules", artist });
    setPanel("main");
  };

  const handleSelectGenre = (genre: Genre) => {
    setDrill({ type: "genre-modules", genre });
    setPanel("main");
  };

  const renderMain = () => {
    if (drill?.type === "artist-modules") {
      return (
        <ModuleList
          focused={panel === "main"}
          artistId={drill.artist.id}
          artistName={drill.artist.name}
          nowPlaying={nowPlaying}
          onPlay={play}
          onBack={() => setDrill(null)}
        />
      );
    }
    if (drill?.type === "genre-modules") {
      return (
        <ModuleList
          focused={panel === "main"}
          genreId={drill.genre.id}
          genreName={drill.genre.name}
          nowPlaying={nowPlaying}
          onPlay={play}
          onBack={() => setDrill(null)}
        />
      );
    }
    switch (view) {
      case "artists":
        return (
          <ArtistList
            focused={panel === "main"}
            searchQuery={searchQuery}
            onSelectArtist={handleSelectArtist}
          />
        );
      case "genres":
        return (
          <GenreList
            focused={panel === "main"}
            onSelectGenre={handleSelectGenre}
          />
        );
      case "search":
        return (
          <SearchView
            focused={panel === "main"}
            nowPlaying={nowPlaying}
            onSelectArtist={handleSelectArtist}
            onPlay={play}
          />
        );
      case "stats":
        return <StatsView />;
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="double" borderColor="green" paddingX={2} height={3}>
        <Box gap={3} alignItems="center">
          <Text bold color="green">
            MOD ARCHIVE CLIENT
          </Text>
          <Text color="gray" dimColor>
            the definitive tracker music browser
          </Text>
          {nowPlaying && (
            <Text color="green" dimColor>
              ♫ {nowPlaying.moduleName.substring(0, 30)}
            </Text>
          )}
        </Box>
      </Box>

      <Box flexGrow={1}>
        <Sidebar activeView={view} focused={panel === "sidebar"} />
        <Box
          flexGrow={1}
          borderStyle="single"
          borderColor={panel === "main" ? "green" : "gray"}
          paddingX={1}
          flexDirection="column"
          overflow="hidden"
        >
          {renderMain()}
        </Box>
      </Box>

      <NowPlayingBar nowPlaying={nowPlaying} status={status} error={error} />
    </Box>
  );
}

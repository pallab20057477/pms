package main

import (
	"log"

	"hms/config"
)

func main() {
	// Connect without running AutoMigrate so we can safely convert columns first.
	config.ConnectDBNoAutoMigrate()
	if config.DB == nil {
		log.Fatal("DB connection not initialized")
	}

	log.Println("Running EnsureTimestampColumns...")
	config.EnsureTimestampColumns(config.DB)
	log.Println("EnsureTimestampColumns completed")
}

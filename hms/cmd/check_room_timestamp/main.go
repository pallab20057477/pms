package main

import (
	"database/sql"
	"fmt"
	"log"

	"hms/config"
)

func main() {
	config.ConnectDBNoAutoMigrate()
	db := config.DB
	if db == nil {
		log.Fatal("DB not initialized")
	}

	var dataType, udtName sql.NullString
	row := db.Raw("SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'created_at'").Row()
	if err := row.Scan(&dataType, &udtName); err != nil {
		log.Fatalf("failed to query information_schema: %v", err)
	}
	fmt.Printf("rooms.created_at data_type=%v udt_name=%v\n", dataType.String, udtName.String)

	var maxVal sql.NullInt64
	if err := db.Raw("SELECT max(created_at) FROM rooms").Row().Scan(&maxVal); err != nil {
		log.Fatalf("failed to query max(created_at): %v", err)
	}
	if maxVal.Valid {
		fmt.Printf("max(created_at)=%d\n", maxVal.Int64)
	} else {
		fmt.Println("max(created_at) is NULL")
	}
}

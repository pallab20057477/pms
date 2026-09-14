package main

import (
	"fmt"
	"hms/config"
	"hms/models"
)

func main() {
	config.ConnectDB()
	db := config.DB

	// Create a sample hotel
	h := models.Hotel{Name: "Demo Hotel", Address1: "123 Market St", Phone: "000-000-0000", TaxType: "GST", TaxPercent: 18, Country: "India"}
	db.Create(&h)

	// Create sample room type
	rt := models.RoomType{HotelID: h.ID, Name: "Deluxe", BasePrice: 2000, MaxOccupancy: 2}
	db.Create(&rt)

	// Create a sample room
	r := models.Room{HotelID: h.ID, RoomNumber: "101", RoomTypeID: rt.ID, Status: "available"}
	db.Create(&r)

	// Create a sample guest
	g := models.Guest{HotelID: h.ID, Name: "John Doe", Phone: "9999999999"}
	db.Create(&g)

	fmt.Println("Seed data created: hotel", h.ID, "room", r.ID, "guest", g.ID)
}
